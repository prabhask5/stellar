import { describe, expect, it } from "vitest";
import { countdown, countdownUnits, eventInstant } from "./countdown.ts";
import { zonedToInstant } from "./dates.ts";
import { zEventCreate, zEventUpdate } from "./schemas.ts";

const LA = "America/Los_Angeles";
const at = (date: string, time: string, tz = LA) => zonedToInstant(date, time, tz);
const units = (c: ReturnType<typeof countdown>) => [
  c.years,
  c.months,
  c.weeks,
  c.days,
  c.hours,
  c.minutes,
  c.seconds,
];

describe("countdown", () => {
  it("counts in the owner's time zone, not UTC or the device's", () => {
    // 23:00 on the 9th in Los Angeles is already the 10th in UTC and Tokyo.
    const now = at("2026-03-09", "23:00:00");
    const event = { date: "2026-03-10", time: null };
    expect(units(countdown(now, event, LA))).toEqual([0, 0, 0, 0, 1, 0, 0]);
    // The same moment, for an owner in Tokyo, is 15:00 on the 10th: the day has begun.
    expect(countdown(now, event, "Asia/Tokyo").past).toBe(true);
  });

  it("breaks the time left into calendar years and months, then weeks, days and the clock", () => {
    const now = at("2026-01-15", "08:30:15");
    expect(units(countdown(now, { date: "2027-04-01", time: "12:00" }, LA))).toEqual(
      // Jan 15 → Mar 15 next year is 1 year 2 months; Mar 15 → Apr 1 is 17 days = 2 weeks 3 days.
      [1, 2, 2, 3, 3, 29, 45],
    );
    // A time of day that has already passed today borrows a day.
    expect(units(countdown(now, { date: "2026-01-17", time: "06:00" }, LA))).toEqual([
      0, 0, 0, 1, 21, 29, 45,
    ]);
  });

  it("treats a month as a month, including month ends", () => {
    const c = countdown(at("2026-01-31", "00:00:00"), { date: "2026-03-01", time: null }, LA);
    // Jan 31 + 1 month is Feb 28; one more day reaches Mar 1.
    expect(units(c)).toEqual([0, 1, 0, 1, 0, 0, 0]);
  });

  it("reaches zero exactly at the event, across a daylight-saving change", () => {
    // Clocks go forward at 02:00 on 2026-03-08 in Los Angeles: that night is an hour short.
    const event = { date: "2026-03-08", time: "09:00" };
    const target = eventInstant(event, LA);
    const evening = countdown(at("2026-03-07", "21:00:00"), event, LA);
    expect(evening.ms).toBe(11 * 3_600_000);
    expect(units(evening)).toEqual([0, 0, 0, 0, 11, 0, 0]);
    expect(units(countdown(target - 1000, event, LA))).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(countdown(target - 1, event, LA)).toMatchObject({ past: false, seconds: 1 });
    expect(countdown(target, event, LA)).toMatchObject({ past: true, seconds: 0 });
    expect(countdown(target + 5000, event, LA).ms).toBe(-5000);
  });

  it("lists units from the largest that is not zero down to seconds", () => {
    const now = at("2026-01-15", "08:30:15");
    expect(countdownUnits(countdown(now, { date: "2027-04-01", time: null }, LA))).toEqual([
      "years",
      "months",
      "weeks",
      "days",
      "hours",
      "minutes",
      "seconds",
    ]);
    expect(countdownUnits(countdown(now, { date: "2026-01-20", time: null }, LA))).toEqual([
      "days",
      "hours",
      "minutes",
      "seconds",
    ]);
    expect(countdownUnits(countdown(now, { date: "2026-01-15", time: "08:30:40" }, LA))).toEqual([
      "seconds",
    ]);
    expect(countdownUnits(countdown(now, { date: "2020-01-01", time: null }, LA))).toEqual([
      "seconds",
    ]);
  });
});

describe("event schemas", () => {
  it("accepts a name, emoji, date and optional time, and rejects bad dates", () => {
    expect(zEventCreate.parse({ name: " Launch ", date: "2027-03-01" })).toEqual({
      name: "Launch",
      date: "2027-03-01",
    });
    expect(
      zEventCreate.parse({ name: "Run", emoji: "🏃", date: "2027-04-18", time: "9:30" }),
    ).toMatchObject({ time: "09:30" });
    expect(zEventCreate.safeParse({ name: "x", date: "2027-13-01" }).success).toBe(false);
    expect(zEventCreate.safeParse({ name: "", date: "2027-01-01" }).success).toBe(false);
    expect(zEventCreate.safeParse({ name: "x" }).success).toBe(false);
    expect(zEventUpdate.parse({ time: null })).toEqual({ time: null });
  });
});
