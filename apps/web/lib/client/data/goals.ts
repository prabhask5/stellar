import type { Goal, GoalList } from "@stellar/db";
import { isGoalComplete, rankAtEnd, rankBetween } from "@stellar/shared";
import { emitCosmic, type ScreenPoint } from "@stellar/universe/bus";
import { findRow, getRows, patchRow, setRows, upsertRow } from "../cache";
import { enqueue } from "../outbox";
import { toast } from "../toast";
import {
  currentUserId,
  insertRow,
  newId,
  nowIso,
  restoreRow,
  softDeleteRow,
  updateRow,
} from "./core";

export function createGoalList(name: string, emoji: string): GoalList {
  const now = nowIso();
  const row: GoalList = {
    id: newId(),
    user_id: currentUserId(),
    name: name.trim(),
    emoji,
    sort_order: rankAtEnd(getRows("sp_goal_lists").map((l) => l.sort_order ?? 0)),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_goal_lists", row, {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    sort_order: row.sort_order,
  });
  return row;
}

export function updateGoalList(id: string, patch: Partial<Pick<GoalList, "name" | "emoji">>): void {
  updateRow("sp_goal_lists", id, patch);
}

export function moveGoalList(id: string, before: number | null, after: number | null): void {
  updateRow("sp_goal_lists", id, { sort_order: rankBetween(before, after) });
}

export function deleteGoalList(id: string): void {
  const goals = getRows("sp_goals").filter((g) => g.list_id === id);
  const removed = softDeleteRow("sp_goal_lists", id);
  if (!removed) return;
  setRows("sp_goals", (rows) => rows.filter((g) => g.list_id !== id));
  toast(`Deleted “${removed.name}”`, {
    undo: () => {
      restoreRow("sp_goal_lists", removed);
      for (const g of goals) upsertRow("sp_goals", g);
    },
  });
}

export interface NewGoal {
  list_id: string;
  name: string;
  description?: string | null;
  type: "todo" | "progress";
  total_amount?: number | null;
  unit?: string | null;
}

export function createGoal(input: NewGoal): Goal {
  const now = nowIso();
  const progress = input.type === "progress";
  const row: Goal = {
    id: newId(),
    user_id: currentUserId(),
    list_id: input.list_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    type: input.type,
    current_amount: 0,
    total_amount: progress ? (input.total_amount ?? null) : null,
    unit: progress ? input.unit?.trim() || null : null,
    completed: false,
    completed_at: null,
    sort_order: rankAtEnd(
      getRows("sp_goals")
        .filter((g) => g.list_id === input.list_id)
        .map((g) => g.sort_order ?? 0),
    ),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_goals", row, {
    id: row.id,
    list_id: row.list_id,
    name: row.name,
    description: row.description,
    type: row.type,
    total_amount: row.total_amount,
    unit: row.unit,
    sort_order: row.sort_order,
  });
  return row;
}

/**
 * Emits the right event for a goal that just changed: reaching 100% (or being checked) is a
 * completion; any other step forward is progress, as strong as the share of the goal it covered.
 */
function celebrate(before: Goal, after: Goal, origin?: ScreenPoint): void {
  if (isGoalComplete(after) && !isGoalComplete(before)) {
    emitCosmic({ type: "goal_completed", id: after.id, origin });
  } else if (after.type === "progress" && after.current_amount > before.current_amount) {
    const step = after.current_amount - before.current_amount;
    const amount = after.total_amount ? step / after.total_amount : 0.1;
    emitCosmic({ type: "goal_progress", id: after.id, amount, origin });
  }
}

export function setGoalCompleted(id: string, completed: boolean, origin?: ScreenPoint): void {
  const current = findRow("sp_goals", id);
  if (!current || current.type !== "todo") return;
  const before = updateRow("sp_goals", id, {
    completed,
    completed_at: completed ? nowIso() : null,
    current_amount: completed ? 1 : 0,
  });
  // The trigger derives current_amount for todo goals; only `completed` needs to be sent.
  if (before) celebrate(before, { ...before, completed }, origin);
}

function withAmount(goal: Goal, amount: number): Partial<Goal> {
  const current_amount = Math.max(0, amount);
  const completed = goal.total_amount !== null && current_amount >= goal.total_amount;
  return {
    current_amount,
    completed,
    completed_at: completed ? (goal.completed_at ?? nowIso()) : null,
    updated_at: nowIso(),
  };
}

/** Adds to a progress goal. Sent as a delta so offline increments from several devices add up. */
export function incrementGoal(id: string, delta: number, origin?: ScreenPoint): void {
  const current = findRow("sp_goals", id);
  if (!current || current.type !== "progress" || delta === 0) return;
  const patch = withAmount(current, current.current_amount + delta);
  patchRow("sp_goals", id, patch);
  enqueue({
    kind: "rpc",
    fn: "sp_goal_increment",
    args: { p_goal_id: id, p_delta: delta },
    rowKeys: [`sp_goals:${id}`],
    // Applied at most once, however often the request is replayed.
    opIdArg: "p_op_id",
  });
  celebrate(current, { ...current, ...patch }, origin);
}

/** Sets an exact amount (typed into the stepper). */
export function setGoalAmount(id: string, amount: number, origin?: ScreenPoint): void {
  const current = findRow("sp_goals", id);
  if (!current || current.type !== "progress") return;
  const patch = withAmount(current, amount);
  patchRow("sp_goals", id, patch);
  enqueue({
    kind: "update",
    table: "sp_goals",
    id,
    patch: { current_amount: patch.current_amount },
  });
  celebrate(current, { ...current, ...patch }, origin);
}

export type GoalPatch = Partial<
  Pick<Goal, "name" | "description" | "type" | "total_amount" | "unit" | "sort_order" | "list_id">
>;

export function updateGoal(id: string, patch: GoalPatch): void {
  const current = findRow("sp_goals", id);
  if (!current) return;
  const next = { ...current, ...patch };
  const local: Partial<Goal> = { ...patch };
  if (next.type === "progress") {
    local.completed =
      next.total_amount !== null && next.current_amount >= (next.total_amount ?? Infinity);
  } else {
    local.total_amount = null;
    local.unit = null;
    if (current.type === "progress") {
      local.completed = false;
      local.current_amount = 0;
    }
  }
  patchRow("sp_goals", id, { ...local, updated_at: nowIso() });
  enqueue({ kind: "update", table: "sp_goals", id, patch: patch as Record<string, unknown> });
}

export function moveGoal(id: string, before: number | null, after: number | null): void {
  updateRow("sp_goals", id, { sort_order: rankBetween(before, after) });
}

export function deleteGoal(id: string): void {
  const removed = softDeleteRow("sp_goals", id);
  if (!removed) return;
  toast("Goal deleted", {
    undo: () => restoreRow("sp_goals", removed),
  });
}
