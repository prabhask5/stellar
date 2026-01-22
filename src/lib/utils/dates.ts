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
