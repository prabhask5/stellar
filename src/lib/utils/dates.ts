import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isBefore,
  isToday,
  parseISO,
  startOfDay,
  getDay
} from 'date-fns';
import type { DayOfWeek, DailyRoutineGoal } from '$lib/types';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Get today's date as a yyyy-MM-dd string in local timezone.
 * Use this instead of new Date().toISOString().split('T')[0]
 * which would give UTC date instead of local date.
 */
export function getTodayDateString(): string {
  return formatDate(new Date());
}

/**
 * Parse a yyyy-MM-dd date string into a Date object in local timezone.
 * Use this instead of new Date(dateStr) which may parse as UTC.
 */
export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export function getDaysInMonth(date: Date): Date[] {
  return eachDayOfInterval({
    start: startOfMonth(date),
    end: endOfMonth(date)
  });
}

export function isPastDay(date: Date): boolean {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  return isBefore(checkDate, today);
}

export function isTodayDate(date: Date): boolean {
  return isToday(date);
}

export function getWeekdayNames(): string[] {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

export function getFirstDayOfMonthWeekday(date: Date): number {
  return startOfMonth(date).getDay();
}

/**
 * Count the number of active occurrences between two dates (inclusive),
 * respecting the active_days filter.
 */
export function countActiveOccurrences(
  startDate: string,
  endDate: string,
  activeDays: DayOfWeek[] | null
): number {
  const start = parseDateString(startDate);
  const end = parseDateString(endDate);
  if (start > end) return 0;

  const days = eachDayOfInterval({ start, end });
  if (activeDays == null || activeDays.length === 0 || activeDays.length === 7) {
    return days.length;
  }
  return days.filter((d) => activeDays.includes(getDay(d) as DayOfWeek)).length;
}

/**
 * Get the 0-based occurrence index of a target date among active days
 * starting from startDate.
 */
export function getOccurrenceIndex(
  startDate: string,
  targetDate: string,
  activeDays: DayOfWeek[] | null
): number {
  const start = parseDateString(startDate);
  const target = parseDateString(targetDate);
  if (target < start) return 0;

  const days = eachDayOfInterval({ start, end: target });
  if (activeDays == null || activeDays.length === 0 || activeDays.length === 7) {
    return days.length - 1;
  }
  return days.filter((d) => activeDays.includes(getDay(d) as DayOfWeek)).length - 1;
}

/**
 * Compute the effective target value for a progressive routine on a given date.
 * Returns the dynamically computed target based on the progression plan.
 */
export function getProgressiveTargetForDate(
  routine: Pick<
    DailyRoutineGoal,
    'start_date' | 'end_date' | 'active_days' | 'start_target_value' | 'end_target_value' | 'progression_schedule'
  >,
  date: string
): number {
  const startVal = routine.start_target_value ?? 0;
  const endVal = routine.end_target_value ?? 0;
  const schedule = routine.progression_schedule ?? 1;

  if (!routine.end_date) return startVal;

  const totalOccurrences = countActiveOccurrences(routine.start_date, routine.end_date, routine.active_days);
  if (totalOccurrences <= 1) return startVal;

  const totalSteps = Math.floor((totalOccurrences - 1) / schedule);
  if (totalSteps === 0) return startVal;

  const incrementAmount = (endVal - startVal) / totalSteps;

  const occurrenceIndex = getOccurrenceIndex(routine.start_date, date, routine.active_days);
  const stepIndex = Math.floor(occurrenceIndex / schedule);

  const effectiveTarget = Math.round(startVal + stepIndex * incrementAmount);

  return Math.max(Math.min(startVal, endVal), Math.min(Math.max(startVal, endVal), effectiveTarget));
}

/**
 * Check if a routine is active on a specific date.
 * A routine is active if:
 * 1. The date is within the routine's start_date and end_date range
 * 2. The day of week is included in the routine's active_days (null/undefined = all days)
 */
export function isRoutineActiveOnDate(
  routine: Pick<DailyRoutineGoal, 'start_date' | 'end_date' | 'active_days'>,
  date: Date | string
): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const dateStr = formatDate(d);

  // Check date range
  if (routine.start_date > dateStr) return false;
  if (routine.end_date && routine.end_date < dateStr) return false;

  // Check active days (null/undefined = all days are active for backwards compatibility)
  if (routine.active_days != null && routine.active_days.length > 0) {
    const dayOfWeek = getDay(d) as DayOfWeek;
    if (!routine.active_days.includes(dayOfWeek)) return false;
  }

  return true;
}
