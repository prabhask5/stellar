import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateRange,
  dayOfWeek,
  diffDays,
  endOfMonth,
  formatLongDate,
  formatShortDate,
  formatTime,
  greetingFor,
  isDateStr,
  isValidTimeZone,
  monthGrid,
  normalizeTime,
  relativeDayName,
  startOfDayInstant,
  startOfWeek,
  todayIn,
  weekdayOrder,
  zonedParts,
  zonedToInstant,
} from "./dates.ts";

describe("civil date maths", () => {
  it("validates date strings", () => {
    expect(isDateStr("2026-02-28")).toBe(true);
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-2-3")).toBe(false);
    expect(isDateStr(20260228)).toBe(false);
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is unaffected by DST transitions", () => {
    // US spring-forward (23h day) and fall-back (25h day) in 2026.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(diffDays("2026-03-01", "2026-03-15")).toBe(14);
    expect(diffDays("2026-10-25", "2026-11-08")).toBe(14);
  });

  it("knows weekdays", () => {
    expect(dayOfWeek("2026-11-21")).toBe(6); // Saturday
    expect(dayOfWeek("2026-01-01")).toBe(4); // Thursday
    expect(dayOfWeek("1969-12-31")).toBe(3); // Wednesday, before the epoch
  });

  it("clamps month arithmetic to the month length", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("finds the start of the week for either week start", () => {
    expect(startOfWeek("2026-11-21", 1)).toBe("2026-11-16");
    expect(startOfWeek("2026-11-21", 0)).toBe("2026-11-15");
    expect(startOfWeek("2026-11-15", 0)).toBe("2026-11-15");
    expect(startOfWeek("2026-11-15", 1)).toBe("2026-11-09");
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("builds a month grid of whole weeks", () => {
    const grid = monthGrid(2026, 11, 0);
    expect(grid).toHaveLength(5);
    expect(grid[0]?.[0]).toEqual({ date: "2026-11-01", day: 1, inMonth: true });
    expect(grid[4]?.[6]).toEqual({ date: "2026-12-05", day: 5, inMonth: false });
    const monday = monthGrid(2026, 11, 1);
    expect(monday[0]?.[0]?.date).toBe("2026-10-26");
    expect(monday.flat().filter((c) => c.inMonth)).toHaveLength(30);
  });

  it("lists inclusive ranges", () => {
    expect(dateRange("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("time zones", () => {
  it("derives today from the owner's zone", () => {
    const instant = Date.UTC(2026, 10, 21, 3, 30); // 03:30 UTC
    expect(todayIn("UTC", instant)).toBe("2026-11-21");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-11-20");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-11-21");
    expect(todayIn("Pacific/Kiritimati", instant)).toBe("2026-11-21");
  });

  it("reads wall-clock parts", () => {
    const p = zonedParts(Date.UTC(2026, 6, 4, 16, 5, 9), "America/New_York");
    expect(p).toEqual({ date: "2026-07-04", hour: 12, minute: 5, second: 9 });
  });

  it("converts wall time to instants around DST", () => {
    // Normal day.
    expect(zonedToInstant("2026-01-15", "09:00", "America/New_York")).toBe(
      Date.UTC(2026, 0, 15, 14),
    );
    // Spring forward: 02:30 does not exist on 2026-03-08 in New York; lands after the gap.
    const gap = zonedToInstant("2026-03-08", "02:30", "America/New_York");
    expect(zonedParts(gap, "America/New_York").hour).toBe(3);
    // Fall back: 01:30 happens twice on 2026-11-01; the first (EDT) wins.
    expect(zonedToInstant("2026-11-01", "01:30", "America/New_York")).toBe(
      Date.UTC(2026, 10, 1, 5, 30),
    );
    // A zone that skips midnight (Santiago springs forward at 00:00).
    const start = startOfDayInstant("2026-09-06", "America/Santiago");
    expect(zonedParts(start, "America/Santiago").date).toBe("2026-09-06");
  });

  it("measures DST days at their real length", () => {
    const tz = "America/New_York";
    const short = startOfDayInstant("2026-03-09", tz) - startOfDayInstant("2026-03-08", tz);
    const long = startOfDayInstant("2026-11-02", tz) - startOfDayInstant("2026-11-01", tz);
    expect(short).toBe(23 * 3_600_000);
    expect(long).toBe(25 * 3_600_000);
  });

  it("validates zone names", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats dates and times", () => {
    expect(formatShortDate("2026-11-17")).toBe("Nov 17");
    expect(formatShortDate("2027-01-02", "2026-11-17")).toBe("Jan 2, 2027");
    expect(formatLongDate("2026-11-21")).toBe("Saturday, Nov 21");
    expect(formatTime("15:00")).toBe("3:00 PM");
    expect(formatTime("00:05:00")).toBe("12:05 AM");
    expect(formatTime("12:30")).toBe("12:30 PM");
  });

  it("normalises times", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("23:59:59")).toBe("23:59");
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("soon")).toBeNull();
  });

  it("names days relative to today", () => {
    const today = "2026-11-21";
    expect(relativeDayName("2026-11-21", today)).toBe("Today");
    expect(relativeDayName("2026-11-22", today)).toBe("Tomorrow");
    expect(relativeDayName("2026-11-20", today)).toBe("Yesterday");
    expect(relativeDayName("2026-11-25", today)).toBe("Wednesday");
    expect(relativeDayName("2026-11-30", today)).toBe("Nov 30");
    expect(relativeDayName("2026-11-17", today)).toBe("Nov 17");
  });

  it("greets by time of day", () => {
    expect(greetingFor(7)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good night");
  });
});
