import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isBefore,
  isAfter,
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

export function isDateInRange(
  date: Date | string,
  startDate: string,
  endDate: string | null
): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const start = parseISO(startDate);
  const dDay = startOfDay(d);
  const startDay = startOfDay(start);

  if (isBefore(dDay, startDay)) return false;

  if (endDate) {
    const end = parseISO(endDate);
    const endDay = startOfDay(end);
    if (isAfter(dDay, endDay)) return false;
  }

  return true;
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
