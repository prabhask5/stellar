/**
 * @fileoverview Date utility functions for the Stellar application.
 *
 * Wraps `date-fns` primitives with application-specific helpers for
 * formatting, parsing, calendar generation, and — most importantly —
 * **progressive routine target computation**.
 *
 * **Timezone note:** All date strings in Stellar are in `YYYY-MM-DD` format
 * and represent **local** calendar dates.  The helpers here are careful to
 * avoid the common pitfall of `new Date(dateStr)` parsing as UTC.
 * Use {@link parseDateString} or {@link formatDate} to stay safe.
 */

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

// =============================================================================
//                         DATE FORMATTING HELPERS
// =============================================================================

/**
 * Format a `Date` object or ISO string into a `YYYY-MM-DD` string.
 *
 * Accepts both `Date` instances and ISO-8601 strings for convenience.
 *
 * @param date - The date to format.
 * @returns A `YYYY-MM-DD` string in the local timezone.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Get today's date as a `YYYY-MM-DD` string in the **local** timezone.
 *
 * Prefer this over `new Date().toISOString().split('T')[0]`, which would
 * return the UTC date — incorrect near midnight in non-UTC timezones.
 *
 * @returns Today's local date as `YYYY-MM-DD`.
 */
export function getTodayDateString(): string {
  return formatDate(new Date());
}

/**
 * Parse a `YYYY-MM-DD` date string into a `Date` in the **local** timezone.
 *
 * Appends `T00:00:00` so the JavaScript `Date` constructor treats the value
 * as local rather than UTC (the default for date-only strings).
 *
 * @param dateStr - A `YYYY-MM-DD` string.
 * @returns A `Date` object representing midnight local time on that day.
 */
export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Format a date for human-readable display — e.g. `"Feb 13, 2026"`.
 *
 * @param date - The date to format.
 * @returns A string like `"MMM d, yyyy"`.
 */
export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

/**
 * Format a date as a full month + year label — e.g. `"February 2026"`.
 *
 * Used primarily by the calendar header.
 *
 * @param date - Any date within the target month.
 * @returns A string like `"MMMM yyyy"`.
 */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy');
}

// =============================================================================
//                         CALENDAR GRID HELPERS
// =============================================================================

/**
 * Generate an array of `Date` objects for every day in the given month.
 *
 * @param date - Any date within the target month.
 * @returns An array of `Date` objects from the 1st to the last day (inclusive).
 */
export function getDaysInMonth(date: Date): Date[] {
  return eachDayOfInterval({
    start: startOfMonth(date),
    end: endOfMonth(date)
  });
}

/**
 * Check whether a date falls **strictly before** today (local time).
 *
 * Both the input and today are normalised to midnight before comparison, so
 * the check is purely calendar-day based.
 *
 * @param date - The date to check.
 * @returns `true` if the date is before today.
 */
export function isPastDay(date: Date): boolean {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  return isBefore(checkDate, today);
}

/**
 * Check whether a date is **today** (local time).
 *
 * Thin wrapper around `date-fns/isToday` for consistency.
 *
 * @param date - The date to check.
 * @returns `true` if the date matches today's calendar day.
 */
export function isTodayDate(date: Date): boolean {
  return isToday(date);
}

/**
 * Return abbreviated weekday names starting from Sunday.
 *
 * @returns `['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']`
 */
export function getWeekdayNames(): string[] {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

/**
 * Get the weekday index (0 = Sunday) of the **first day** of a month.
 *
 * Used to calculate the leading empty cells in a calendar grid.
 *
 * @param date - Any date within the target month.
 * @returns A number 0–6 representing the weekday of the 1st.
 */
export function getFirstDayOfMonthWeekday(date: Date): number {
  return startOfMonth(date).getDay();
}

// =============================================================================
//                    ACTIVE OCCURRENCE CALCULATIONS
// =============================================================================

/**
 * Count how many **active** days fall between `startDate` and `endDate`
 * (inclusive), filtered by an optional `activeDays` mask.
 *
 * If `activeDays` is `null`, empty, or includes all 7 days, every calendar
 * day in the range counts.
 *
 * @param startDate  - Range start (`YYYY-MM-DD`).
 * @param endDate    - Range end (`YYYY-MM-DD`), inclusive.
 * @param activeDays - Weekday filter, or `null` for all days.
 * @returns The number of matching days. Returns `0` if `start > end`.
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

  /* Fast path — no filtering needed when all days are active */
  if (activeDays == null || activeDays.length === 0 || activeDays.length === 7) {
    return days.length;
  }
  return days.filter((d) => activeDays.includes(getDay(d) as DayOfWeek)).length;
}

/**
 * Get the **0-based occurrence index** of `targetDate` among active days
 * starting from `startDate`.
 *
 * For example, if a routine runs Mon/Wed/Fri and `startDate` is a Monday,
 * then Monday's index is `0`, Wednesday's is `1`, Friday's is `2`, etc.
 *
 * @param startDate  - The first active date (`YYYY-MM-DD`).
 * @param targetDate - The date whose index we want (`YYYY-MM-DD`).
 * @param activeDays - Weekday filter, or `null` for all days.
 * @returns 0-based index. Returns `0` if `targetDate < startDate`.
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

  /* Fast path — every day is an active occurrence */
  if (activeDays == null || activeDays.length === 0 || activeDays.length === 7) {
    return days.length - 1;
  }
  return days.filter((d) => activeDays.includes(getDay(d) as DayOfWeek)).length - 1;
}

// =============================================================================
//                     PROGRESSIVE TARGET COMPUTATION
// =============================================================================

/**
 * Compute the **effective target value** for a progressive routine on a
 * specific date.
 *
 * Progressive routines linearly interpolate between `start_target_value` and
 * `end_target_value` over their lifespan, stepping the target every
 * `progression_schedule` active occurrences.
 *
 * **Algorithm:**
 * 1. Count total active occurrences over the routine's full date range.
 * 2. Derive the total number of discrete "steps" (`totalSteps`).
 * 3. Compute the per-step increment: `(endVal - startVal) / totalSteps`.
 * 4. Find the target date's occurrence index and its corresponding step.
 * 5. Clamp the result to `[min(start, end), max(start, end)]`.
 *
 * **Edge cases:**
 * - Open-ended routines (`end_date === null`) → always return `startVal`.
 * - Single-occurrence routines → return `startVal`.
 * - `progression_schedule` of `0` or `null` → defaults to `1`.
 *
 * @param routine - A partial routine object containing the fields needed for
 *                  the computation.
 * @param date    - The target date (`YYYY-MM-DD`).
 * @returns The rounded integer target value for that date.
 */
export function getProgressiveTargetForDate(
  routine: Pick<
    DailyRoutineGoal,
    | 'start_date'
    | 'end_date'
    | 'active_days'
    | 'start_target_value'
    | 'end_target_value'
    | 'progression_schedule'
  >,
  date: string
): number {
  const startVal = routine.start_target_value ?? 0;
  const endVal = routine.end_target_value ?? 0;
  const schedule = routine.progression_schedule ?? 1;

  /* Open-ended routines have no progression — return the starting value */
  if (!routine.end_date) return startVal;

  /* ── Total active occurrences across the routine's full lifespan ──── */
  const totalOccurrences = countActiveOccurrences(
    routine.start_date,
    routine.end_date,
    routine.active_days
  );
  if (totalOccurrences <= 1) return startVal;

  /* ── Discrete steps and per-step increment ──── */
  const totalSteps = Math.floor((totalOccurrences - 1) / schedule);
  if (totalSteps === 0) return startVal;

  const incrementAmount = (endVal - startVal) / totalSteps;

  /* ── Map the target date to its step index ──── */
  const occurrenceIndex = getOccurrenceIndex(routine.start_date, date, routine.active_days);
  const stepIndex = Math.floor(occurrenceIndex / schedule);

  const effectiveTarget = Math.round(startVal + stepIndex * incrementAmount);

  /* Clamp to [min(start, end), max(start, end)] so we never overshoot */
  return Math.max(
    Math.min(startVal, endVal),
    Math.min(Math.max(startVal, endVal), effectiveTarget)
  );
}

// =============================================================================
//                     ROUTINE ACTIVE-DATE CHECKER
// =============================================================================

/**
 * Determine whether a {@link DailyRoutineGoal} is **active** on a given date.
 *
 * A routine is considered active when **both** conditions are met:
 * 1. The date falls within `[start_date, end_date]` (inclusive). An `end_date`
 *    of `null` means the routine is open-ended.
 * 2. The date's day-of-week is included in `active_days`. When `active_days`
 *    is `null` or empty, **all** days are treated as active (backwards
 *    compatibility).
 *
 * @param routine - A partial routine with date-range and active-days fields.
 * @param date    - The date to test (accepts `Date` or ISO string).
 * @returns `true` if the routine should appear on that date's list.
 */
export function isRoutineActiveOnDate(
  routine: Pick<DailyRoutineGoal, 'start_date' | 'end_date' | 'active_days'>,
  date: Date | string
): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const dateStr = formatDate(d);

  /* ── Date range check ──── */
  if (routine.start_date > dateStr) return false;
  if (routine.end_date && routine.end_date < dateStr) return false;

  /* ── Day-of-week check (null / empty = all days for backwards compat) ──── */
  if (routine.active_days != null && routine.active_days.length > 0) {
    const dayOfWeek = getDay(d) as DayOfWeek;
    if (!routine.active_days.includes(dayOfWeek)) return false;
  }

  return true;
}
