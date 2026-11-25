import { describe, expect, it } from "vitest";
import { SITE_FIXTURES } from "@stellar/shared/fixtures";
import { hash32, randomFor, seededRandom, unitFor } from "@stellar/shared/hash";
import {
  hostMatchesPattern,
  normalizeAppUrl,
  normalizeSitePattern,
  normalizeSupabaseUrl,
  parseSiteList,
} from "@stellar/shared/normalize";
import {
  dayCompletion,
  formatAmount,
  formatDuration,
  goalOver,
  goalProgress,
  instanceOver,
  instanceProgress,
  listProgress,
  timeProgress,
  toPercent,
} from "@stellar/shared/progress";
import {
  needsRebalance,
  rankAtEnd,
  rankBetween,
  rankForMove,
  rebalancedRanks,
} from "@stellar/shared/rank";

describe("goal progress", () => {
  it("scores todo goals as 0 or 1", () => {
    expect(
      goalProgress({ type: "todo", completed: false, current_amount: 0, total_amount: null }),
    ).toBe(0);
    expect(
      goalProgress({ type: "todo", completed: true, current_amount: 0, total_amount: null }),
    ).toBe(1);
  });
  it("scores progress goals as min(current / total, 1)", () => {
    const g = (current: number, total: number | null) =>
      goalProgress({
        type: "progress",
        completed: false,
        current_amount: current,
        total_amount: total,
      });
    expect(g(5, 20)).toBe(0.25);
    expect(g(30, 20)).toBe(1);
    expect(g(-3, 20)).toBe(0);
    expect(g(5, 0)).toBe(0);
    expect(g(5, null)).toBe(0);
  });
  it("averages a list across both types", () => {
    const p = listProgress([
      { type: "todo", completed: true, current_amount: 1, total_amount: null },
      { type: "todo", completed: false, current_amount: 0, total_amount: null },
      { type: "progress", completed: false, current_amount: 5, total_amount: 10 },
      { type: "progress", completed: true, current_amount: 12, total_amount: 10 },
    ]);
    expect(p.fraction).toBeCloseTo(0.625);
    expect(p).toMatchObject({ percent: 63, complete: 2, total: 4, allComplete: false });
    expect(listProgress([])).toMatchObject({ percent: 0, total: 0, allComplete: false });
  });

  it("counts past a goal's total for display only, up to three times it", () => {
    const g = (current_amount: number, total_amount: number | null = 10) =>
      ({ type: "progress", completed: false, current_amount, total_amount }) as const;
    expect(goalOver(g(5))).toBe(0.5);
    expect(goalOver(g(15))).toBe(1.5);
    expect(goalOver(g(99))).toBe(3);
    expect(goalOver(g(5, 0))).toBe(0);
    expect(goalProgress(g(15))).toBe(1);
    expect(goalOver({ type: "todo", completed: true, current_amount: 9, total_amount: null })).toBe(
      1,
    );
    expect(instanceOver({ type: "progress", completed: true, amount: 25, total_amount: 10 })).toBe(
      2.5,
    );
    // A list goes past 100% only once every goal in it is complete.
    expect(listProgress([g(30), g(0)])).toMatchObject({ fraction: 0.5, over: 0.5 });
    expect(listProgress([g(30), g(10)])).toMatchObject({ fraction: 1, over: 2, percent: 100 });
  });
});

describe("routine day completion", () => {
  it("is the mean of the day's instances and null when nothing is scheduled", () => {
    expect(dayCompletion([])).toBeNull();
    const day = dayCompletion([
      { type: "todo", total_amount: null, completed: true, amount: 0 },
      { type: "progress", total_amount: 8, completed: false, amount: 5 },
      { type: "progress", total_amount: 20, completed: false, amount: 12 },
      { type: "todo", total_amount: null, completed: false, amount: 0 },
    ]);
    expect(day).toBeCloseTo((1 + 0.625 + 0.6 + 0) / 4);
    expect(
      instanceProgress({ type: "progress", total_amount: 8, completed: false, amount: 99 }),
    ).toBe(1);
  });
});

describe("time progress", () => {
  const tz = "America/New_York";
  const noon = Date.UTC(2026, 10, 21, 17, 0); // Sat Nov 21 2026, 12:00 EST

  it("computes day, week, month and year in the owner's zone", () => {
    const p = timeProgress(noon, tz, 1, null, 85);
    expect(p.day).toBeCloseTo(0.5, 5);
    expect(p.week).toBeCloseTo(5.5 / 7, 5); // Monday start: Mon–Fri done, half of Saturday
    expect(p.month).toBeCloseTo(20.5 / 30, 3);
    expect(p.year).toBeGreaterThan(0.88);
    expect(p.year).toBeLessThan(0.9);
    expect(p.life).toBeNull();
  });

  it("respects the week start", () => {
    expect(timeProgress(noon, tz, 0, null, 85).week).toBeCloseTo(6.5 / 7, 5);
  });

  it("accounts for a 23-hour DST day", () => {
    const midday = Date.UTC(2026, 2, 8, 16, 0); // 12:00 EDT on spring-forward day
    expect(timeProgress(midday, tz, 1, null, 85).day).toBeCloseTo(11 / 23, 5);
  });

  it("computes life from birthdate and lifespan", () => {
    const p = timeProgress(noon, tz, 1, "1996-11-21", 60);
    expect(p.life).toBeCloseTo(0.5, 3);
    expect(timeProgress(noon, tz, 1, "1900-01-01", 85).life).toBe(1);
  });

  it("formats helpers", () => {
    expect(toPercent(0.826)).toBe(83);
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(0)).toBe("0m");
    expect(formatAmount(2.5)).toBe("2.5");
    expect(formatAmount(12.0000001)).toBe("12");
  });
});

describe("site patterns", () => {
  it.each(SITE_FIXTURES)("normalises $input", ({ input, expected }) => {
    const r = normalizeSitePattern(input);
    if (expected === null) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
    } else {
      expect(r).toEqual({ ok: true, value: expected });
    }
  });

  it("matches the domain and every subdomain, nothing else", () => {
    expect(hostMatchesPattern("youtube.com", "youtube.com")).toBe(true);
    expect(hostMatchesPattern("music.youtube.com", "youtube.com")).toBe(true);
    expect(hostMatchesPattern("WWW.YouTube.com.", "youtube.com")).toBe(true);
    expect(hostMatchesPattern("notyoutube.com", "youtube.com")).toBe(false);
    expect(hostMatchesPattern("youtube.com.evil.io", "youtube.com")).toBe(false);
  });

  it("parses pasted lists", () => {
    const r = parseSiteList(
      "youtube.com\nhttps://www.reddit.com/r/all, twitter.com youtube.com\nnot_valid\n",
    );
    expect(r.valid).toEqual(["youtube.com", "reddit.com", "twitter.com"]);
    expect(r.invalid.map((i) => i.input)).toEqual(["not_valid"]);
  });
});

describe("URL normalisation", () => {
  const url = (input: string) => {
    const r = normalizeSupabaseUrl(input);
    return r.ok ? r.value.url : null;
  };

  it("cleans Supabase URLs", () => {
    expect(url("  https://database.example.com/  ")).toBe("https://database.example.com");
    expect(url("database.example.com")).toBe("https://database.example.com");
    expect(url("https://database.example.com/rest/v1/")).toBe("https://database.example.com");
    expect(url("https://database.example.com/auth/v1")).toBe("https://database.example.com");
    expect(url("https://database.example.com/api")).toBe("https://database.example.com");
    expect(url("https://example.com/supabase/rest/v1")).toBe("https://example.com/supabase");
    expect(url("http://localhost:8000")).toBe("http://localhost:8000");
    expect(url("localhost:54321/rest/v1")).toBe("http://localhost:54321");
    expect(url("192.168.1.20:8000")).toBe("http://192.168.1.20:8000");
    expect(url("")).toBeNull();
    expect(url("not a url")).toBeNull();
  });

  it("reports when it changed what was typed", () => {
    const changed = normalizeSupabaseUrl("https://database.example.com/api");
    expect(changed.ok && changed.value.changed).toBe(true);
    expect(changed.ok && changed.value.entered).toBe("https://database.example.com/api");
    const same = normalizeSupabaseUrl("database.example.com/");
    expect(same.ok && same.value.changed).toBe(false);
  });

  it("cleans app URLs", () => {
    const app = (input: string) => {
      const r = normalizeAppUrl(input);
      return r.ok ? r.value : null;
    };
    expect(app("planner.example.com")).toBe("https://planner.example.com");
    expect(app("https://planner.example.com/focus")).toBe("https://planner.example.com");
    expect(app("https://planner.example.com/api/v1/instance")).toBe("https://planner.example.com");
    expect(app("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(app("https://example.com/planner/")).toBe("https://example.com/planner");
    expect(app("   ")).toBeNull();
  });
});

describe("ranking", () => {
  it("places ranks between neighbours", () => {
    expect(rankBetween(null, null)).toBe(1024);
    expect(rankBetween(1024, null)).toBe(2048);
    expect(rankBetween(null, 1024)).toBe(0);
    expect(rankBetween(1024, 2048)).toBe(1536);
    expect(rankAtEnd([1024, 4096, 2048])).toBe(5120);
    expect(rankAtEnd([])).toBe(1024);
  });

  it("computes a single-row move", () => {
    const ranks = [1024, 2048, 3072, 4096];
    expect(rankForMove(ranks, 0, 2)).toBe(3584); // between 3072 and 4096
    expect(rankForMove(ranks, 3, 0)).toBe(0);
    expect(rankForMove(ranks, 1, 3)).toBe(5120);
    expect(rankForMove(ranks, 2, 2)).toBeNull();
  });

  it("detects exhausted gaps", () => {
    expect(needsRebalance(1, 1.0000000001)).toBe(true);
    expect(needsRebalance(1024, 2048)).toBe(false);
    expect(rebalancedRanks(3)).toEqual([1024, 2048, 3072]);
  });
});

describe("deterministic hashing", () => {
  it("is stable and well distributed", () => {
    expect(hash32("a")).toBe(hash32("a"));
    expect(hash32("a")).not.toBe(hash32("b"));
    expect(hash32("a", 1)).not.toBe(hash32("a", 2));
    const r1 = randomFor("0b1e7c9e-1111-4222-8333-444455556666");
    const r2 = randomFor("0b1e7c9e-1111-4222-8333-444455556666");
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    const rand = seededRandom(42);
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += rand();
    expect(sum / 2000).toBeGreaterThan(0.45);
    expect(sum / 2000).toBeLessThan(0.55);
    expect(unitFor("x")).toBeGreaterThanOrEqual(0);
    expect(unitFor("x")).toBeLessThan(1);
  });
});
