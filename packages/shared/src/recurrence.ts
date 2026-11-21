import { addDays, type DateStr, dayOfWeek, diffDays, weekdayName } from "./dates.ts";

export type RoutineFrequency = "daily" | "weekdays" | "interval";

/** The scheduling fields of a routine. Mirrors SQL `sp_routine_scheduled`. */
export interface RoutineSchedule {
  start_date: DateStr;
  end_date: DateStr | null;
  frequency: RoutineFrequency;
  /** 0 = Sunday … 6 = Saturday. Required for "weekdays". */
  weekdays: number[] | null;
  /** ≥ 2, counted from start_date. Required for "interval". */
  interval_days: number | null;
}

/** Whether a routine has an instance on a civil date. */
export function isScheduled(routine: RoutineSchedule, date: DateStr): boolean {
  if (date < routine.start_date) return false;
  if (routine.end_date !== null && date > routine.end_date) return false;
  switch (routine.frequency) {
    case "daily":
      return true;
    case "weekdays":
      return (routine.weekdays ?? []).includes(dayOfWeek(date));
    case "interval": {
      const n = routine.interval_days ?? 0;
      if (n < 1) return false;
      return diffDays(routine.start_date, date) % n === 0;
    }
    default:
      return false;
  }
}

/** The next `count` scheduled dates on or after `from`. */
export function nextScheduledDates(
  routine: RoutineSchedule,
  from: DateStr,
  count: number,
  horizonDays = 366 * 3,
): DateStr[] {
  const out: DateStr[] = [];
  let cursor = from < routine.start_date ? routine.start_date : from;
  for (let i = 0; i < horizonDays && out.length < count; i++) {
    if (routine.end_date !== null && cursor > routine.end_date) break;
    if (isScheduled(routine, cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** "Every day", "Mon, Wed, Fri", "Every 3 days". */
export function scheduleSummary(
  routine: Pick<RoutineSchedule, "frequency" | "weekdays" | "interval_days">,
): string {
  switch (routine.frequency) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const days = [...new Set(routine.weekdays ?? [])].sort((a, b) => a - b);
      if (days.length === 7) return "Every day";
      if (days.length === 0) return "No days selected";
      if (days.join() === "1,2,3,4,5") return "Weekdays";
      if (days.join() === "0,6") return "Weekends";
      // Read Monday-first, the way people say it.
      const ordered = [...days.filter((d) => d !== 0), ...days.filter((d) => d === 0)];
      return ordered.map((d) => weekdayName(d, true)).join(", ");
    }
    case "interval":
      return `Every ${routine.interval_days ?? 2} days`;
    default:
      return "";
  }
}

/**
 * Consecutive scheduled days fully completed, ending today or on the most
 * recent scheduled day before today. An incomplete *today* does not break the
 * streak (the day is not over). Mirrors SQL `sp_routine_streak`.
 */
export function computeStreak(
  routine: RoutineSchedule,
  isComplete: (date: DateStr) => boolean,
  today: DateStr,
  maxLookbackDays = 3660,
): number {
  let streak = 0;
  let cursor = routine.end_date !== null && routine.end_date < today ? routine.end_date : today;
  for (let i = 0; i < maxLookbackDays && cursor >= routine.start_date; i++) {
    if (isScheduled(routine, cursor)) {
      if (isComplete(cursor)) streak++;
      else if (cursor !== today) break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * A constellation dims when its streak is broken: the most recent scheduled
 * day before today was missed and the routine has been completed at least once.
 */
export function isStreakBroken(
  routine: RoutineSchedule,
  isComplete: (date: DateStr) => boolean,
  today: DateStr,
  hasAnyCompletion: boolean,
): boolean {
  if (!hasAnyCompletion) return false;
  return computeStreak(routine, isComplete, today) === 0;
}

export interface ScheduleProblem {
  field: "weekdays" | "interval_days" | "end_date" | "total_amount";
  message: string;
}

/** Validation shared by the form and the API (the DB enforces the same rules). */
export function validateSchedule(routine: RoutineSchedule): ScheduleProblem | null {
  if (routine.frequency === "weekdays" && (routine.weekdays ?? []).length === 0) {
    return { field: "weekdays", message: "Pick at least one weekday." };
  }
  if (routine.frequency === "weekdays" && (routine.weekdays ?? []).some((d) => d < 0 || d > 6)) {
    return { field: "weekdays", message: "Weekdays must be between Sunday and Saturday." };
  }
  if (routine.frequency === "interval" && (routine.interval_days ?? 0) < 2) {
    return { field: "interval_days", message: "Use an interval of at least 2 days." };
  }
  if (routine.end_date !== null && routine.end_date < routine.start_date) {
    return { field: "end_date", message: "The end date can't be before the start date." };
  }
  return null;
}
