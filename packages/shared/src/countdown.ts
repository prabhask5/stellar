import {
  addDays,
  addMonths,
  type DateStr,
  diffDays,
  parts,
  zonedParts,
  zonedToInstant,
} from "./dates.ts";

export interface EventLike {
  /** The owner's calendar day. */
  date: DateStr;
  /** Wall-clock time on that day, "HH:MM" or "HH:MM:SS"; null means the start of the day. */
  time: string | null;
}

export interface Countdown {
  /** The moment has come (or gone). Every unit is then 0. */
  past: boolean;
  /** Milliseconds left; negative once past. */
  ms: number;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** The instant an event happens, in the owner's time zone. */
export function eventInstant(event: EventLike, tz: string): number {
  return zonedToInstant(event.date, event.time ?? "00:00:00", tz);
}

/**
 * Time left until an event, the way a person would say it: whole calendar years and
 * months first (a month is a month, whatever its length), then weeks and days, then the
 * hours, minutes and seconds of the last day. All in the owner's time zone, so "3 days"
 * means three of the owner's days.
 */
export function countdown(now: number, event: EventLike, tz: string): Countdown {
  const target = eventInstant(event, tz);
  const ms = target - now;
  const zero = { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (ms <= 0) return { past: true, ms, ...zero };

  const here = zonedParts(now, tz);
  const [h = 0, m = 0, s = 0] = (event.time ?? "00:00:00").split(":").map(Number);
  const targetClock = h * 3600 + m * 60 + s;
  const hereClock = here.hour * 3600 + here.minute * 60 + here.second;
  // The clock part runs from now to the event's time of day; if that time has already
  // passed today, it runs into tomorrow and the calendar part starts a day later.
  let clock = targetClock - hereClock;
  let from = here.date;
  if (clock < 0) {
    clock += 86_400;
    from = addDays(from, 1);
  }

  let wholeMonths = Math.max(
    0,
    (parts(event.date).year - parts(from).year) * 12 +
      (parts(event.date).month - parts(from).month),
  );
  while (wholeMonths > 0 && addMonths(from, wholeMonths) > event.date) wholeMonths--;
  const restDays = Math.max(0, diffDays(addMonths(from, wholeMonths), event.date));
  // On the last day the real time left is used, so the count reaches zero exactly at the
  // event even across a daylight-saving change.
  if (wholeMonths === 0 && restDays === 0) clock = Math.ceil(ms / 1000);

  return {
    past: false,
    ms,
    years: Math.floor(wholeMonths / 12),
    months: wholeMonths % 12,
    weeks: Math.floor(restDays / 7),
    days: restDays % 7,
    hours: Math.floor(clock / 3600),
    minutes: Math.floor((clock % 3600) / 60),
    seconds: clock % 60,
  };
}

export const COUNTDOWN_UNITS = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
] as const;
export type CountdownUnit = (typeof COUNTDOWN_UNITS)[number];

/** The units from the largest one that is not zero down to seconds (always at least seconds). */
export function countdownUnits(c: Countdown): CountdownUnit[] {
  const first = COUNTDOWN_UNITS.findIndex((u) => c[u] > 0);
  return COUNTDOWN_UNITS.slice(first < 0 ? COUNTDOWN_UNITS.length - 1 : first);
}
