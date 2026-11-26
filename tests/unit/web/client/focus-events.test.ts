import { describe, expect, it } from "vitest";
import { focusEventsFor } from "@web/lib/client/data/focus";

type Moment = Parameters<typeof focusEventsFor>[0];

const NOW = Date.parse("2026-11-25T12:00:00Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const idle: Moment = {
  phase: "focus",
  status: "idle",
  last_completed_phase: null,
  last_completed_at: null,
};
const focusing: Moment = { ...idle, status: "running" };
const paused: Moment = { ...idle, status: "paused" };
const breaking: Moment = { ...idle, phase: "short_break", status: "running" };
const events = (before: Moment, after: Moment) => focusEventsFor(before, after, NOW);

describe("focus events from timer changes", () => {
  it("starts when a focus phase begins, not when it resumes", () => {
    expect(events(idle, focusing)).toEqual(["focus_started"]);
    expect(events({ ...breaking, status: "awaiting", phase: "focus" }, focusing)).toEqual([
      "focus_started",
    ]);
    expect(events(focusing, paused)).toEqual([]);
    expect(events(paused, focusing)).toEqual([]);
  });

  it("completes when a focus phase runs to its end, then the break begins", () => {
    const done = { last_completed_phase: "focus" as const, last_completed_at: at(1) };
    expect(events(focusing, { ...breaking, ...done })).toEqual(["focus_completed", "focus_break"]);
    // Auto-start off: the phase completed and the break is waiting to be started.
    expect(events(focusing, { ...breaking, ...done, status: "awaiting" })).toEqual([
      "focus_completed",
    ]);
  });

  it("does not celebrate a skipped or ended phase", () => {
    expect(events(focusing, breaking)).toEqual(["focus_break"]);
    expect(events(focusing, idle)).toEqual([]);
  });

  it("starts the break only once, and nothing when a break is paused or resumed", () => {
    expect(events({ ...breaking, status: "awaiting" }, breaking)).toEqual(["focus_break"]);
    expect(events(breaking, { ...breaking, status: "paused" })).toEqual([]);
    expect(events({ ...breaking, status: "paused" }, breaking)).toEqual([]);
  });

  it("starts focus again after a break that ran out", () => {
    const done = { last_completed_phase: "short_break" as const, last_completed_at: at(1) };
    expect(events(breaking, { ...focusing, ...done })).toEqual(["focus_started"]);
  });

  it("says nothing about a completion that was not seen happening", () => {
    const stale = { last_completed_phase: "focus" as const, last_completed_at: at(60) };
    expect(
      events(focusing, { ...idle, status: "awaiting", phase: "short_break", ...stale }),
    ).toEqual([]);
  });

  it("says nothing when the same state arrives again (the server's echo)", () => {
    for (const s of [idle, focusing, paused, breaking]) expect(events(s, { ...s })).toEqual([]);
  });
});
