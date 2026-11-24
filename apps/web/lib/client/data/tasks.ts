import type { Task, TaskList } from "@stellar/db";
import { isOverdue, rankAtEnd, rankBetween } from "@stellar/shared";
import { emitCosmic, type ScreenPoint } from "@stellar/universe/bus";
import { findRow, getRows, patchRow, removeRow, setRows, touchUniverse, upsertRow } from "../cache";
import { enqueue } from "../outbox";
import { toast } from "../toast";
import {
  currentToday,
  currentUserId,
  insertRow,
  newId,
  nowIso,
  restoreRow,
  softDeleteRow,
  updateRow,
  whenZoneKnown,
  zoneKnown,
} from "./core";

export interface NewTask {
  name: string;
  description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  list_id?: string | null;
}

function ranksOf(listId: string | null): number[] {
  return getRows("sp_tasks")
    .filter((t) => t.list_id === listId)
    .map((t) => t.sort_order ?? 0);
}

export function createTask(input: NewTask): Task {
  const now = nowIso();
  const listId = input.list_id ?? null;
  const row: Task = {
    id: newId(),
    user_id: currentUserId(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    // List tasks have no dates.
    due_date: listId ? null : (input.due_date ?? null),
    due_time: listId || !input.due_date ? null : (input.due_time ?? null),
    list_id: listId,
    completed: false,
    completed_at: null,
    sort_order: rankAtEnd(ranksOf(listId)),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  const {
    user_id: _u,
    created_at: _c,
    updated_at: _up,
    completed_at: _ca,
    deleted_at: _d,
    ...send
  } = row;
  insertRow("sp_tasks", row, send);
  return row;
}

/**
 * Creates a task due "today". Today is the owner's day, which needs their time zone; in
 * the first moments of the first launch on a device it may not be known yet, and the
 * device's day could be the wrong one. In that case the task is created as soon as the
 * settings arrive, with the right day.
 */
export function createTaskForToday(input: Omit<NewTask, "due_date">): void {
  if (zoneKnown()) createTask({ ...input, due_date: currentToday() });
  else void whenZoneKnown().then(() => createTask({ ...input, due_date: currentToday() }));
}

export type TaskPatch = Partial<
  Pick<Task, "name" | "description" | "due_date" | "due_time" | "list_id" | "sort_order">
>;

export function updateTask(id: string, patch: TaskPatch): void {
  const current = findRow("sp_tasks", id);
  if (!current) return;
  const next: TaskPatch = { ...patch };
  const listId = next.list_id !== undefined ? next.list_id : current.list_id;
  if (listId) {
    // Moving into a list clears the dates.
    next.due_date = null;
    next.due_time = null;
  }
  const dueDate = next.due_date !== undefined ? next.due_date : current.due_date;
  if (!dueDate) next.due_time = null;
  if (
    next.list_id !== undefined &&
    next.list_id !== current.list_id &&
    next.sort_order === undefined
  ) {
    next.sort_order = rankAtEnd(ranksOf(next.list_id));
  }
  updateRow("sp_tasks", id, next);
}

/** Completes or re-opens a task. Completing ignites a star from where the checkbox was. */
export function setTaskCompleted(id: string, completed: boolean, origin?: ScreenPoint): void {
  const before = updateRow("sp_tasks", id, {
    completed,
    completed_at: completed ? nowIso() : null,
  });
  if (!before || before.completed === completed) return;
  if (completed) emitCosmic({ type: "task_completed", id, origin });
}

export function deleteTask(id: string): void {
  const removed = softDeleteRow("sp_tasks", id);
  if (!removed) return;
  toast("Task deleted", { undo: () => restoreRow("sp_tasks", removed) });
}

/** "Move all to today": every incomplete overdue non-list task, keeping its time. One round trip, with Undo. */
export function postponeOverdue(): number {
  const today = currentToday();
  const overdue = getRows("sp_tasks").filter((t) => isOverdue(t, today));
  if (overdue.length === 0) return 0;
  const moved = overdue.map((t) => ({ id: t.id, due_date: t.due_date as string }));
  for (const t of overdue) patchRow("sp_tasks", t.id, { due_date: today, updated_at: nowIso() });
  const rowKeys = moved.map((m) => `sp_tasks:${m.id}`);
  enqueue({ kind: "rpc", fn: "sp_postpone_overdue_to_today", args: {}, rowKeys });
  emitCosmic({ type: "overdue_postponed", count: overdue.length });
  toast(overdue.length === 1 ? "Moved 1 task to today" : `Moved ${overdue.length} tasks to today`, {
    undo: () => {
      for (const m of moved)
        patchRow("sp_tasks", m.id, { due_date: m.due_date, updated_at: nowIso() });
      enqueue({ kind: "rpc", fn: "sp_restore_due_dates", args: { p_moved: moved }, rowKeys });
    },
  });
  return overdue.length;
}

/** Drag reorder within a list: writes exactly one row. */
export function moveTask(id: string, before: number | null, after: number | null): void {
  updateRow("sp_tasks", id, { sort_order: rankBetween(before, after) });
}

// ── task lists ──────────────────────────────────────────────────────────────
export function createTaskList(name: string, emoji: string): TaskList {
  const now = nowIso();
  const row: TaskList = {
    id: newId(),
    user_id: currentUserId(),
    name: name.trim(),
    emoji,
    sort_order: rankAtEnd(getRows("sp_task_lists").map((l) => l.sort_order ?? 0)),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_task_lists", row, {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    sort_order: row.sort_order,
  });
  return row;
}

export function updateTaskList(id: string, patch: Partial<Pick<TaskList, "name" | "emoji">>): void {
  updateRow("sp_task_lists", id, patch);
}

export function moveTaskList(id: string, before: number | null, after: number | null): void {
  updateRow("sp_task_lists", id, { sort_order: rankBetween(before, after) });
}

/** Deletes a list and its tasks (the database cascades the soft delete); Undo restores exactly those. */
export function deleteTaskList(id: string): void {
  const tasks = getRows("sp_tasks").filter((t) => t.list_id === id);
  const removed = softDeleteRow("sp_task_lists", id);
  if (!removed) return;
  setRows("sp_tasks", (rows) => rows.filter((t) => t.list_id !== id));
  toast(`Deleted “${removed.name}”`, {
    undo: () => {
      restoreRow("sp_task_lists", removed);
      for (const t of tasks) upsertRow("sp_tasks", t);
    },
  });
}

export function removeTaskLocally(id: string): void {
  removeRow("sp_tasks", id);
  touchUniverse();
}
