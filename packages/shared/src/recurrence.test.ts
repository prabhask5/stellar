import { describe, expect, it } from "vitest";
import { RECURRENCE_FIXTURES, STREAK_FIXTURES } from "./fixtures.ts";
import {
  computeStreak,
  isScheduled,
  isStreakBroken,
  nextScheduledDates,
  type RoutineSchedule,
  scheduleSummary,
  validateSchedule,
} from "./recurrence.ts";

const base: RoutineSchedule = {
  start_date: "2026-11-21",
  end_date: null,
  frequency: "daily",
  weekdays: null,
  interval_days: null,
};

describe("isScheduled", () => {
  it.each(RECURRENCE_FIXTURES)("$name", ({ routine, date, expected }) => {
    expect(isScheduled(routine, date)).toBe(expected);
  });

  it("is false for malformed rules rather than throwing", () => {
    expect(isScheduled({ ...base, frequency: "weekdays", weekdays: null }, "2026-11-23")).toBe(
      false,
    );
    expect(isScheduled({ ...base, frequency: "interval", interval_days: null }, "2026-11-23")).toBe(
      false,
    );
    expect(isScheduled({ ...base, frequency: "interval", interval_days: 0 }, "2026-11-21")).toBe(
      false,
    );
  });
});

describe("nextScheduledDates", () => {
  it("previews the next 14 dates for each frequency", () => {
    expect(nextScheduledDates(base, "2026-11-21", 14)).toHaveLength(14);
    const mwf = nextScheduledDates(
      { ...base, frequency: "weekdays", weekdays: [1, 3, 5] },
      "2026-11-21",
      4,
    );
    expect(mwf).toEqual(["2026-11-23", "2026-11-25", "2026-11-27", "2026-11-30"]);
    const every3 = nextScheduledDates(
      { ...base, frequency: "interval", interval_days: 3 },
      "2026-11-22",
      3,
    );
    expect(every3).toEqual(["2026-11-24", "2026-11-27", "2026-11-30"]);
  });

  it("starts at the start date and stops at the end date", () => {
    const r = { ...base, start_date: "2026-12-01", end_date: "2026-12-03" };
    expect(nextScheduledDates(r, "2026-11-21", 14)).toEqual([
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
    ]);
    expect(nextScheduledDates(r, "2026-12-10", 14)).toEqual([]);
  });
});

describe("scheduleSummary", () => {
  it("describes each frequency", () => {
    expect(scheduleSummary(base)).toBe("Every day");
    expect(
      scheduleSummary({ frequency: "weekdays", weekdays: [5, 1, 3], interval_days: null }),
    ).toBe("Mon, Wed, Fri");
    expect(
      scheduleSummary({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5], interval_days: null }),
    ).toBe("Weekdays");
    expect(scheduleSummary({ frequency: "weekdays", weekdays: [0, 6], interval_days: null })).toBe(
      "Weekends",
    );
    expect(scheduleSummary({ frequency: "weekdays", weekdays: [0, 2], interval_days: null })).toBe(
      "Tue, Sun",
    );
    expect(
      scheduleSummary({
        frequency: "weekdays",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        interval_days: null,
      }),
    ).toBe("Every day");
    expect(scheduleSummary({ frequency: "interval", weekdays: null, interval_days: 3 })).toBe(
      "Every 3 days",
    );
  });
});

describe("streaks", () => {
  it.each(STREAK_FIXTURES)("$name", ({ routine, completed, today, expected }) => {
    const done = new Set(completed);
    expect(computeStreak(routine, (d) => done.has(d), today)).toBe(expected);
  });

  it("flags a broken streak only once there is history", () => {
    const none = () => false;
    expect(isStreakBroken(base, none, "2026-11-25", false)).toBe(false);
    expect(isStreakBroken(base, none, "2026-11-25", true)).toBe(true);
    const done = new Set(["2026-11-24"]);
    expect(isStreakBroken(base, (d) => done.has(d), "2026-11-25", true)).toBe(false);
  });
});

describe("validateSchedule", () => {
  it("accepts valid rules", () => {
    expect(validateSchedule(base)).toBeNull();
    expect(validateSchedule({ ...base, frequency: "interval", interval_days: 2 })).toBeNull();
  });
  it("rejects incomplete rules", () => {
    expect(validateSchedule({ ...base, frequency: "weekdays", weekdays: [] })?.field).toBe(
      "weekdays",
    );
    expect(validateSchedule({ ...base, frequency: "weekdays", weekdays: [7] })?.field).toBe(
      "weekdays",
    );
    expect(validateSchedule({ ...base, frequency: "interval", interval_days: 1 })?.field).toBe(
      "interval_days",
    );
    expect(validateSchedule({ ...base, end_date: "2026-11-20" })?.field).toBe("end_date");
  });
});
