import type { Routine, RoutineLog } from "@stellar/db";
import {
  computeStreak,
  type DateStr,
  dayCompletion,
  isScheduled,
  type RoutineSchedule,
} from "@stellar/shared";

export interface DayInstance {
  routine: Routine;
  completed: boolean;
  amount: number;
}

/** Logs indexed by "routine:date" for O(1) lookups while building a month. */
export function indexLogs(logs: readonly RoutineLog[]): Map<string, RoutineLog> {
  const map = new Map<string, RoutineLog>();
  for (const l of logs) map.set(`${l.routine_id}:${l.date}`, l);
  return map;
}

/** The routine day-goals for one date, computed from the schedule (they are never stored). */
export function instancesFor(
  routines: readonly Routine[],
  logs: Map<string, RoutineLog>,
  date: DateStr,
): DayInstance[] {
  const out: DayInstance[] = [];
  for (const routine of routines) {
    if (!isScheduled(routine as RoutineSchedule, date)) continue;
    const log = logs.get(`${routine.id}:${date}`);
    out.push({ routine, completed: log?.completed ?? false, amount: log?.amount ?? 0 });
  }
  return out;
}

/** Completion 0…1 for a date; null when nothing is scheduled (no ring). */
export function fractionFor(
  routines: readonly Routine[],
  logs: Map<string, RoutineLog>,
  date: DateStr,
): number | null {
  return dayCompletion(
    instancesFor(routines, logs, date).map((i) => ({
      type: i.routine.type,
      total_amount: i.routine.total_amount,
      completed: i.completed,
      amount: i.amount,
    })),
  );
}

export function streakFor(routine: Routine, logs: readonly RoutineLog[], today: DateStr): number {
  const done = new Set<string>();
  for (const l of logs) if (l.routine_id === routine.id && l.completed) done.add(l.date);
  return computeStreak(routine as RoutineSchedule, (d) => done.has(d), today);
}

/** A routine is active while today is inside its start and end dates. */
export function isActive(routine: Routine, today: DateStr): boolean {
  return routine.end_date === null || routine.end_date >= today;
}
