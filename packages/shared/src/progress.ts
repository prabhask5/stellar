import {
  addDays,
  addMonths,
  type DateStr,
  parts,
  startOfDayInstant,
  startOfWeek,
  toDateStr,
  todayIn,
  type WeekStart,
} from "./dates.ts";

export type GoalType = "todo" | "progress";

export interface GoalLike {
  type: GoalType;
  completed: boolean;
  current_amount: number;
  total_amount: number | null;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** todo → 0 or 1; progress → min(current / total, 1). */
export function goalProgress(goal: GoalLike): number {
  if (goal.type === "todo") return goal.completed ? 1 : 0;
  if (!goal.total_amount || goal.total_amount <= 0) return 0;
  return clamp01(goal.current_amount / goal.total_amount);
}

/** Progress bars keep growing past a goal's total up to this many times it, then stop. */
export const MAX_OVER = 3;

/** Amount over total without the cap at 1: 1.5 is half as much again, at most MAX_OVER. */
function over(current: number, total: number | null): number {
  if (!total || total <= 0 || !Number.isFinite(current)) return 0;
  return Math.min(MAX_OVER, Math.max(0, current / total));
}

/**
 * Like `goalProgress`, but going past 1 for a progress goal taken beyond its total. Only
 * for display: whether a goal is complete, and every average, use `goalProgress`.
 */
export function goalOver(goal: GoalLike): number {
  return goal.type === "todo" ? goalProgress(goal) : over(goal.current_amount, goal.total_amount);
}

export function isGoalComplete(goal: GoalLike): boolean {
  return goal.type === "todo" ? goal.completed : goalProgress(goal) >= 1;
}

export interface ListProgress {
  /** Mean progress of the goals, 0…1. */
  fraction: number;
  /**
   * For display: equal to `fraction` until every goal is complete, then the mean with goals
   * counted past their totals (up to MAX_OVER). One runaway goal cannot make an unfinished
   * list look finished.
   */
  over: number;
  percent: number;
  complete: number;
  total: number;
  allComplete: boolean;
}

/** Mean of the goals' progress across both types. */
export function listProgress(goals: readonly GoalLike[]): ListProgress {
  const total = goals.length;
  if (total === 0)
    return { fraction: 0, over: 0, percent: 0, complete: 0, total: 0, allComplete: false };
  let sum = 0;
  let complete = 0;
  let raw = 0;
  for (const g of goals) {
    sum += goalProgress(g);
    raw += goalOver(g);
    if (isGoalComplete(g)) complete++;
  }
  const fraction = sum / total;
  return {
    fraction,
    over: complete === total ? raw / total : fraction,
    percent: Math.round(fraction * 100),
    complete,
    total,
    allComplete: complete === total,
  };
}

export interface RoutineInstanceLike {
  type: GoalType;
  total_amount: number | null;
  completed: boolean;
  amount: number;
}

export function instanceProgress(i: RoutineInstanceLike): number {
  if (i.type === "todo") return i.completed ? 1 : 0;
  if (!i.total_amount || i.total_amount <= 0) return 0;
  return clamp01(i.amount / i.total_amount);
}

/** Like `instanceProgress`, but going past 1 when the amount is beyond the total (display only). */
export function instanceOver(i: RoutineInstanceLike): number {
  return i.type === "todo" ? instanceProgress(i) : over(i.amount, i.total_amount);
}

/** Mean progress of a day's scheduled instances; null when nothing is scheduled (no ring). */
export function dayCompletion(instances: readonly RoutineInstanceLike[]): number | null {
  if (instances.length === 0) return null;
  let sum = 0;
  for (const i of instances) sum += instanceProgress(i);
  return sum / instances.length;
}

export interface TimeProgress {
  day: number;
  week: number;
  month: number;
  year: number;
  /** Null when no birthdate is set. */
  life: number | null;
}

function span(now: number, start: number, end: number): number {
  if (end <= start) return 0;
  return clamp01((now - start) / (end - start));
}

/** How far through the day, week, month, year and expected life "now" is, in the owner's zone. */
export function timeProgress(
  now: number,
  tz: string,
  weekStart: WeekStart,
  birthdate: DateStr | null,
  lifespanYears: number,
): TimeProgress {
  const today = todayIn(tz, now);
  const { year, month } = parts(today);
  const at = (d: DateStr) => startOfDayInstant(d, tz);

  const weekStartDate = startOfWeek(today, weekStart);
  const monthStart = toDateStr(year, month, 1);

  let life: number | null = null;
  if (birthdate) {
    const end = addMonths(birthdate, Math.round(lifespanYears * 12));
    life = span(now, at(birthdate), at(end));
  }

  return {
    day: span(now, at(today), at(addDays(today, 1))),
    week: span(now, at(weekStartDate), at(addDays(weekStartDate, 7))),
    month: span(now, at(monthStart), at(addMonths(monthStart, 1))),
    year: span(now, at(toDateStr(year, 1, 1)), at(toDateStr(year + 1, 1, 1))),
    life,
  };
}

export function toPercent(fraction: number): number {
  return Math.round(clamp01(fraction) * 100);
}

/** "1h 15m", "45m", "0m". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** Trims float noise for amounts shown next to a unit ("12", "2.5"). */
export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
