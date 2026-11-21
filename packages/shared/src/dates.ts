/**
 * Calendar-date utilities. A `DateStr` is a civil date "YYYY-MM-DD" with no
 * time zone; arithmetic on it is done in UTC so DST never shifts a day.
 * Anything that needs "now" takes the owner's IANA time zone explicitly.
 */

export type DateStr = string;
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 86_400_000;

export function isDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toDateStr(year: number, month1: number, day: number): DateStr {
  return `${pad(year, 4)}-${pad(month1)}-${pad(day)}`;
}

/** Days since the Unix epoch for a civil date. */
export function dayNumber(date: DateStr): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DAY);
}

export function fromDayNumber(n: number): DateStr {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromDayNumber(dayNumber(date) + days);
}

/** b − a in whole days. */
export function diffDays(a: DateStr, b: DateStr): number {
  return dayNumber(b) - dayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: DateStr): number {
  // 1970-01-01 was a Thursday (4).
  return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

export function parts(date: DateStr): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function addMonths(date: DateStr, months: number): DateStr {
  const { year, month, day } = parts(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toDateStr(y, m, Math.min(day, daysInMonth(y, m)));
}

export function startOfMonth(date: DateStr): DateStr {
  const { year, month } = parts(date);
  return toDateStr(year, month, 1);
}

export function endOfMonth(date: DateStr): DateStr {
  const { year, month } = parts(date);
  return toDateStr(year, month, daysInMonth(year, month));
}

export function startOfWeek(date: DateStr, weekStart: WeekStart): DateStr {
  const offset = (dayOfWeek(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(tz: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  date: DateStr;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock date and time of an instant in a time zone. */
export function zonedParts(instant: Date | number, tz: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const p of zoneFormatter(tz).formatToParts(instant)) map[p.type] = p.value;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Today's civil date in the owner's time zone. */
export function todayIn(tz: string, now: Date | number = Date.now()): DateStr {
  return zonedParts(now, tz).date;
}

/** Offset (ms) of the zone at an instant: local wall time − UTC. */
function zoneOffsetMs(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  const asUtc =
    dayNumber(p.date) * MS_DAY + p.hour * 3_600_000 + p.minute * 60_000 + p.second * 1000;
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instant at which a wall-clock date/time occurs in a zone. In a spring-forward
 * gap the result lands after the gap; in a fall-back overlap the first occurrence wins.
 */
export function zonedToInstant(date: DateStr, time: string, tz: string): number {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  const wall = dayNumber(date) * MS_DAY + h * 3_600_000 + m * 60_000 + s * 1000;
  let guess = wall - zoneOffsetMs(wall, tz);
  const corrected = wall - zoneOffsetMs(guess, tz);
  if (corrected !== guess) {
    // Crossing a transition: prefer the earlier valid instant when both map back to the wall time.
    const a = Math.min(guess, corrected);
    const b = Math.max(guess, corrected);
    const pa = zonedParts(a, tz);
    guess = pa.date === date && pa.hour === h && pa.minute === m ? a : b;
  }
  return guess;
}

/** Midnight at the start of a civil date in a zone, as an instant. */
export function startOfDayInstant(date: DateStr, tz: string): number {
  return zonedToInstant(date, "00:00:00", tz);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayName(dow: number, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[((dow % 7) + 7) % 7] ?? "";
}

export function monthName(month1: number, short = false): string {
  return (short ? MONTHS : MONTHS_LONG)[month1 - 1] ?? "";
}

/** "Nov 21" (adds the year when it differs from `today`'s). */
export function formatShortDate(date: DateStr, today?: DateStr): string {
  const p = parts(date);
  const base = `${monthName(p.month, true)} ${p.day}`;
  return today && parts(today).year !== p.year ? `${base}, ${p.year}` : base;
}

/** "Saturday, Nov 21" */
export function formatLongDate(date: DateStr): string {
  const p = parts(date);
  return `${weekdayName(dayOfWeek(date))}, ${monthName(p.month, true)} ${p.day}`;
}

/** "3:00 PM" from "15:00" or "15:00:00". */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
}

/** Normalises "H:MM" / "HH:MM:SS" to "HH:MM". Returns null when invalid. */
export function normalizeTime(time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Relative name used for group headers and due labels. */
export function relativeDayName(date: DateStr, today: DateStr): string {
  const d = diffDays(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return weekdayName(dayOfWeek(date));
  return formatShortDate(date, today);
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export interface MonthCell {
  date: DateStr;
  day: number;
  inMonth: boolean;
}

/** Whole weeks covering a month, starting on `weekStart`. */
export function monthGrid(year: number, month1: number, weekStart: WeekStart): MonthCell[][] {
  const first = toDateStr(year, month1, 1);
  const last = toDateStr(year, month1, daysInMonth(year, month1));
  let cursor = startOfWeek(first, weekStart);
  const weeks: MonthCell[][] = [];
  while (cursor <= last) {
    const week: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const p = parts(cursor);
      week.push({ date: cursor, day: p.day, inMonth: p.month === month1 && p.year === year });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekday indices in display order for a week start, e.g. [1,2,3,4,5,6,0]. */
export function weekdayOrder(weekStart: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

/** Inclusive list of dates. */
export function dateRange(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let n = dayNumber(from), end = dayNumber(to); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}
