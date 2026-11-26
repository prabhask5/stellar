import type { Routine, RoutineLog } from "@stellar/db";
import { dayCompletion, isScheduled, rankAtEnd, type RoutineSchedule } from "@stellar/shared";
import { emitCosmic, type ScreenPoint } from "@stellar/universe/bus";
import { findRow, getRows, patchRow, removeRow, setRows, upsertRow } from "../cache";
import { enqueue } from "../outbox";
import { currentUserId, insertRow, newId, nowIso } from "./core";

export interface RoutineInput {
  name: string;
  description?: string | null;
  emoji?: string | null;
  type: "todo" | "progress";
  total_amount?: number | null;
  unit?: string | null;
  start_date: string;
  end_date?: string | null;
  frequency: "daily" | "weekdays" | "interval";
  weekdays?: number[] | null;
  interval_days?: number | null;
}

/** The same normalisation the database trigger applies. */
function normalize(input: RoutineInput) {
  const progress = input.type === "progress";
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    emoji: input.emoji?.trim() || null,
    type: input.type,
    total_amount: progress ? (input.total_amount ?? null) : null,
    unit: progress ? input.unit?.trim() || null : null,
    start_date: input.start_date,
    end_date: input.end_date ?? null,
    frequency: input.frequency,
    weekdays:
      input.frequency === "weekdays"
        ? [...new Set(input.weekdays ?? [])].sort((a, b) => a - b)
        : null,
    interval_days: input.frequency === "interval" ? (input.interval_days ?? null) : null,
  };
}

export function createRoutine(input: RoutineInput): Routine {
  const now = nowIso();
  const fields = normalize(input);
  const row: Routine = {
    id: newId(),
    user_id: currentUserId(),
    ...fields,
    sort_order: rankAtEnd(getRows("sp_routines").map((r) => r.sort_order ?? 0)),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_routines", row, { id: row.id, ...fields, sort_order: row.sort_order });
  return row;
}

/**
 * Edit = rewrite everything. Mirrors the database trigger locally so the
 * calendar updates at once: logs on days that are no longer scheduled go, and
 * a change of type or total resets what remains.
 */
export function updateRoutine(id: string, input: RoutineInput): void {
  const current = findRow("sp_routines", id);
  if (!current) return;
  const fields = normalize(input);
  const next: Routine = { ...current, ...fields, updated_at: nowIso() };
  upsertRow("sp_routines", next);
  const measureChanged = current.type !== next.type || current.total_amount !== next.total_amount;
  setRows("sp_routine_logs", (logs) =>
    logs
      .filter((l) => l.routine_id !== id || isScheduled(next as RoutineSchedule, l.date))
      .map((l) =>
        l.routine_id === id && measureChanged ? { ...l, completed: false, amount: 0 } : l,
      ),
  );
  enqueue({ kind: "update", table: "sp_routines", id, patch: fields });
}

/** Hard delete: removes the routine and all of its history. The UI confirms first. */
export function deleteRoutine(id: string): void {
  if (!removeRow("sp_routines", id)) return;
  setRows("sp_routine_logs", (logs) => logs.filter((l) => l.routine_id !== id));
  enqueue({ kind: "delete", table: "sp_routines", id });
}

function logsFor(date: string): RoutineLog[] {
  return getRows("sp_routine_logs").filter((l) => l.date === date);
}

/** Completion 0…1 of a day from the cache; null when nothing is scheduled. */
export function dayFraction(date: string): number | null {
  const logs = new Map(logsFor(date).map((l) => [l.routine_id, l]));
  const instances = getRows("sp_routines")
    .filter((r) => isScheduled(r as RoutineSchedule, date))
    .map((r) => {
      const log = logs.get(r.id);
      return {
        type: r.type as "todo" | "progress",
        total_amount: r.total_amount,
        completed: log?.completed ?? false,
        amount: log?.amount ?? 0,
      };
    });
  return dayCompletion(instances);
}

/**
 * Records one day's result. Todo routines take `completed`; progress routines
 * take `amount` and complete when it reaches the total. Past days are editable.
 */
export function setRoutineLog(
  routineId: string,
  date: string,
  value: { completed?: boolean; amount?: number },
  origin?: ScreenPoint,
): void {
  const routine = findRow("sp_routines", routineId);
  if (!routine || !isScheduled(routine as RoutineSchedule, date)) return;
  const key = `${routineId}:${date}`;
  const existing = findRow("sp_routine_logs", key);
  const wasDayComplete = (dayFraction(date) ?? 0) >= 1;

  let completed: boolean;
  let amount: number;
  if (routine.type === "progress") {
    amount = Math.max(0, value.amount ?? existing?.amount ?? 0);
    completed = routine.total_amount !== null && amount >= routine.total_amount;
  } else {
    completed = value.completed ?? existing?.completed ?? false;
    amount = completed ? 1 : 0;
  }
  if (existing && existing.completed === completed && existing.amount === amount) return;

  const now = nowIso();
  const row: RoutineLog = {
    routine_id: routineId,
    date,
    user_id: routine.user_id,
    completed,
    amount,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  if (existing) patchRow("sp_routine_logs", key, row);
  else upsertRow("sp_routine_logs", row);
  enqueue({
    kind: "log",
    routine_id: routineId,
    date,
    completed: routine.type === "todo" ? completed : null,
    amount: routine.type === "progress" ? amount : null,
  });

  if (completed && !(existing?.completed ?? false)) {
    emitCosmic({ type: "routine_checked", id: routineId, origin });
    if (!wasDayComplete && (dayFraction(date) ?? 0) >= 1)
      emitCosmic({ type: "routine_day_complete", date });
  }
}
