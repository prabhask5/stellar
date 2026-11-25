import { describe, expect, it } from "vitest";
import { TIMER_FIXTURES } from "@stellar/shared/fixtures";
import {
  applyTimerAction,
  availableActions,
  DEFAULT_TIMER_SETTINGS,
  formatClock,
  IDLE_TIMER_STATE,
  isBlockingActive,
  isDue,
  nextPhase,
  phaseDurationMs,
  phaseEndMessage,
  remainingMs,
  type TimerState,
} from "@stellar/shared/timer";

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);

describe("timer fixtures (shared with SQL)", () => {
  for (const fixture of TIMER_FIXTURES) {
    it(fixture.name, () => {
      let state: TimerState = IDLE_TIMER_STATE;
      for (const [i, step] of fixture.steps.entries()) {
        const now = T0 + step.at * 1000;
        const result = applyTimerAction(
          state,
          fixture.settings,
          step.action,
          step.expectedVersion ?? state.version,
          now,
          { newSessionId: () => "00000000-0000-4000-8000-000000000001" },
        );
        const label = `step ${i} (${step.action})`;
        expect(result.ok, label).toBe(step.expect.ok);
        if (!result.ok) expect(result.error, label).toBe(step.expect.error);
        const s = result.state;
        expect(s.status, label).toBe(step.expect.status);
        expect(s.phase, label).toBe(step.expect.phase);
        expect(s.round, label).toBe(step.expect.round);
        expect(s.version, label).toBe(step.expect.version);
        const remaining =
          s.status === "running"
            ? (s.phase_ends_at ?? 0) - now
            : s.status === "paused"
              ? s.paused_remaining_ms
              : null;
        expect(remaining, label).toBe(step.expect.remaining);
        expect(isBlockingActive(s), label).toBe(step.expect.blocking);
        if (step.expect.session !== undefined) {
          if (step.expect.session === null) expect(result.session, label).toBeNull();
          else expect(result.session, label).toMatchObject(step.expect.session);
        }
        state = result.state;
      }
    });
  }
});

describe("transitions", () => {
  const settings = DEFAULT_TIMER_SETTINGS;
  const start = () => applyTimerAction(IDLE_TIMER_STATE, settings, "start", 0, T0).state;

  it("never mutates the input state", () => {
    const frozen = Object.freeze({ ...IDLE_TIMER_STATE });
    const r = applyTimerAction(frozen, settings, "start", 0, T0);
    expect(r.ok).toBe(true);
    expect(frozen.status).toBe("idle");
  });

  it("assigns a session id on start and clears it on end", () => {
    const running = start();
    expect(running.session_id).toMatch(/^[0-9a-f-]{36}$/);
    const ended = applyTimerAction(running, settings, "end", 1, T0 + 1000);
    expect(ended.state.session_id).toBeNull();
    expect(ended.state.phase_total_ms).toBeNull();
  });

  it("keeps the planned length when settings change mid-phase", () => {
    const running = start();
    const longer = { ...settings, focus_min: 50 };
    const paused = applyTimerAction(running, longer, "pause", 1, T0 + 60_000).state;
    expect(paused.phase_total_ms).toBe(25 * 60_000);
    expect(paused.paused_remaining_ms).toBe(24 * 60_000);
  });

  it("starts the next phase at the boundary when the advancer is slightly late", () => {
    const auto = { ...settings, auto_start_breaks: true };
    const running = applyTimerAction(IDLE_TIMER_STATE, auto, "start", 0, T0).state;
    const boundary = T0 + 25 * 60_000;
    const r = applyTimerAction(running, auto, "advance", 1, boundary + 2_000);
    expect(r.state.phase_started_at).toBe(boundary);
    expect(r.state.last_completed_phase).toBe("focus");
    expect(r.state.last_completed_at).toBe(boundary);
    expect(r.session?.ended_at).toBe(boundary);
  });

  it("pause is allowed in every phase but only focus blocks", () => {
    const auto = { ...settings, auto_start_breaks: true };
    let s = applyTimerAction(IDLE_TIMER_STATE, auto, "start", 0, T0).state;
    s = applyTimerAction(s, auto, "advance", s.version, T0 + 25 * 60_000).state;
    expect(s.phase).toBe("short_break");
    const paused = applyTimerAction(s, auto, "pause", s.version, T0 + 26 * 60_000);
    expect(paused.ok).toBe(true);
    expect(isBlockingActive(paused.state)).toBe(false);
  });

  it("blocking rule: focus running or paused only", () => {
    expect(isBlockingActive({ phase: "focus", status: "running" })).toBe(true);
    expect(isBlockingActive({ phase: "focus", status: "paused" })).toBe(true);
    expect(isBlockingActive({ phase: "focus", status: "awaiting" })).toBe(false);
    expect(isBlockingActive({ phase: "focus", status: "idle" })).toBe(false);
    expect(isBlockingActive({ phase: "short_break", status: "running" })).toBe(false);
    expect(isBlockingActive({ phase: "long_break", status: "paused" })).toBe(false);
  });

  it("long-break cadence follows rounds_before_long", () => {
    expect(nextPhase("focus", 1, settings)).toEqual({ phase: "short_break", round: 1 });
    expect(nextPhase("focus", 3, settings)).toEqual({ phase: "short_break", round: 3 });
    expect(nextPhase("focus", 4, settings)).toEqual({ phase: "long_break", round: 4 });
    expect(nextPhase("short_break", 3, settings)).toEqual({ phase: "focus", round: 4 });
    expect(nextPhase("long_break", 4, settings)).toEqual({ phase: "focus", round: 1 });
    expect(nextPhase("focus", 1, { ...settings, rounds_before_long: 1 })).toEqual({
      phase: "long_break",
      round: 1,
    });
  });

  it("derives remaining time without ticking", () => {
    const running = start();
    expect(remainingMs(running, T0 + 5_000)).toBe(25 * 60_000 - 5_000);
    expect(remainingMs(running, T0 + 99 * 60_000)).toBe(0);
    expect(isDue(running, T0 + 25 * 60_000)).toBe(true);
    expect(isDue(running, T0 + 25 * 60_000 - 1)).toBe(false);
    expect(remainingMs(IDLE_TIMER_STATE, T0, settings)).toBe(25 * 60_000);
    expect(phaseDurationMs("long_break", settings)).toBe(15 * 60_000);
  });

  it("offers the right controls per state", () => {
    expect(availableActions(IDLE_TIMER_STATE)).toEqual(["start"]);
    expect(availableActions(start())).toEqual(["pause", "skip", "end"]);
  });
});

describe("formatting", () => {
  it("formats the clock", () => {
    expect(formatClock(22 * 60_000 + 57_000)).toBe("22:57");
    expect(formatClock(999)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(3_723_000)).toBe("1:02:03");
  });

  it("writes notification copy", () => {
    expect(phaseEndMessage("focus", "short_break", DEFAULT_TIMER_SETTINGS).body).toBe(
      "Focus complete. Time for a 5-minute break.",
    );
    expect(phaseEndMessage("focus", "long_break", DEFAULT_TIMER_SETTINGS).body).toBe(
      "Focus complete. Time for a 15-minute break.",
    );
    expect(phaseEndMessage("short_break", "focus", DEFAULT_TIMER_SETTINGS).title).toBe(
      "Break over",
    );
  });
});
