/**
 * Focus timer state machine. Pure and deterministic: every transition takes the
 * current state, the settings, an action, the caller's expected version and
 * "now". SQL `sp__timer_apply` mirrors this file line for line and both are
 * tested against the same fixtures.
 *
 * The timer never ticks. Time remaining is always derived from `phase_ends_at`
 * (running) or `paused_remaining_ms` (paused).
 */

export type TimerStatus = "idle" | "running" | "paused" | "awaiting";
export type TimerPhase = "focus" | "short_break" | "long_break";
export type TimerAction = "start" | "pause" | "resume" | "skip" | "end" | "advance";

export const TIMER_ACTIONS: readonly TimerAction[] = [
  "start",
  "pause",
  "resume",
  "skip",
  "end",
  "advance",
];

export interface TimerSettings {
  focus_min: number;
  short_break_min: number;
  long_break_min: number;
  rounds_before_long: number;
  auto_start_breaks: boolean;
  auto_start_focus: boolean;
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focus_min: 25,
  short_break_min: 5,
  long_break_min: 15,
  rounds_before_long: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
};

export interface TimerState {
  status: TimerStatus;
  phase: TimerPhase;
  round: number;
  /** Epoch ms. Null when idle or awaiting. */
  phase_started_at: number | null;
  /** Epoch ms. Set only while running. */
  phase_ends_at: number | null;
  /** Set only while paused. */
  paused_remaining_ms: number | null;
  /** Planned length of the current phase, fixed when it starts. */
  phase_total_ms: number | null;
  /** Identifies one sitting, from the first Start to End. */
  session_id: string | null;
  version: number;
  /** The most recently completed (not skipped) phase, for notifications. */
  last_completed_phase: TimerPhase | null;
  last_completed_at: number | null;
}

export const IDLE_TIMER_STATE: TimerState = {
  status: "idle",
  phase: "focus",
  round: 1,
  phase_started_at: null,
  phase_ends_at: null,
  paused_remaining_ms: null,
  phase_total_ms: null,
  session_id: null,
  version: 0,
  last_completed_phase: null,
  last_completed_at: null,
};

/** One finished or abandoned phase, written to `sp_focus_sessions`. */
export interface TimerSessionRecord {
  started_at: number;
  ended_at: number;
  phase: TimerPhase;
  planned_seconds: number;
  actual_seconds: number;
  completed: boolean;
  round: number;
}

export type TimerErrorCode = "version_conflict" | "invalid_transition" | "not_due";

export type TimerResult =
  | { ok: true; state: TimerState; session: TimerSessionRecord | null }
  | { ok: false; error: TimerErrorCode; state: TimerState; session: null };

/** If the advancer is at most this late, the next phase starts exactly at the boundary. */
export const ADVANCE_GRACE_MS = 10_000;

export function phaseDurationMs(phase: TimerPhase, settings: TimerSettings): number {
  const minutes =
    phase === "focus"
      ? settings.focus_min
      : phase === "short_break"
        ? settings.short_break_min
        : settings.long_break_min;
  return minutes * 60_000;
}

/** The phase and round that follow a phase. After a long break the cycle restarts at round 1. */
export function nextPhase(
  phase: TimerPhase,
  round: number,
  settings: TimerSettings,
): { phase: TimerPhase; round: number } {
  if (phase === "focus") {
    const long = round % Math.max(1, settings.rounds_before_long) === 0;
    return { phase: long ? "long_break" : "short_break", round };
  }
  if (phase === "long_break") return { phase: "focus", round: 1 };
  return { phase: "focus", round: round + 1 };
}

function autoStarts(phase: TimerPhase, settings: TimerSettings): boolean {
  return phase === "focus" ? settings.auto_start_focus : settings.auto_start_breaks;
}

/** Remaining time of the current phase in ms (0 when idle, full length when awaiting). */
export function remainingMs(state: TimerState, now: number, settings?: TimerSettings): number {
  if (state.status === "running" && state.phase_ends_at !== null) {
    return Math.max(0, state.phase_ends_at - now);
  }
  if (state.status === "paused" && state.paused_remaining_ms !== null) {
    return Math.max(0, state.paused_remaining_ms);
  }
  if (settings) return phaseDurationMs(state.phase, settings);
  return state.phase_total_ms ?? 0;
}

/** Website blocking is on iff a focus phase is running or paused. */
export function isBlockingActive(state: Pick<TimerState, "phase" | "status">): boolean {
  return state.phase === "focus" && (state.status === "running" || state.status === "paused");
}

/** True when a running phase has reached its end and should be advanced. */
export function isDue(state: TimerState, now: number): boolean {
  return state.status === "running" && state.phase_ends_at !== null && now >= state.phase_ends_at;
}

function sessionFor(state: TimerState, now: number, completed: boolean): TimerSessionRecord | null {
  if (state.status !== "running" && state.status !== "paused") return null;
  const total = state.phase_total_ms ?? 0;
  const remaining =
    state.status === "running"
      ? Math.max(0, (state.phase_ends_at ?? now) - now)
      : Math.max(0, state.paused_remaining_ms ?? 0);
  const elapsed = completed ? total : Math.min(total, Math.max(0, total - remaining));
  return {
    started_at: state.phase_started_at ?? now,
    ended_at: now,
    phase: state.phase,
    planned_seconds: Math.round(total / 1000),
    actual_seconds: Math.round(elapsed / 1000),
    completed,
    round: state.round,
  };
}

function begin(
  base: TimerState,
  phase: TimerPhase,
  round: number,
  startAt: number,
  settings: TimerSettings,
): TimerState {
  const total = phaseDurationMs(phase, settings);
  return {
    ...base,
    status: "running",
    phase,
    round,
    phase_started_at: startAt,
    phase_ends_at: startAt + total,
    paused_remaining_ms: null,
    phase_total_ms: total,
  };
}

function await_(base: TimerState, phase: TimerPhase, round: number): TimerState {
  return {
    ...base,
    status: "awaiting",
    phase,
    round,
    phase_started_at: null,
    phase_ends_at: null,
    paused_remaining_ms: null,
    phase_total_ms: null,
  };
}

export interface ApplyOptions {
  /** Supplies the id for a new sitting. Defaults to crypto.randomUUID(). */
  newSessionId?: () => string;
}

export function applyTimerAction(
  state: TimerState,
  settings: TimerSettings,
  action: TimerAction,
  expectedVersion: number,
  now: number,
  options: ApplyOptions = {},
): TimerResult {
  if (expectedVersion !== state.version) {
    return { ok: false, error: "version_conflict", state, session: null };
  }
  const fail = (error: TimerErrorCode): TimerResult => ({ ok: false, error, state, session: null });
  const bump = (next: TimerState): TimerState => ({ ...next, version: state.version + 1 });

  switch (action) {
    case "start": {
      if (state.status === "idle") {
        const session_id = (options.newSessionId ?? (() => crypto.randomUUID()))();
        const next = begin({ ...state, session_id }, "focus", 1, now, settings);
        return { ok: true, state: bump(next), session: null };
      }
      if (state.status === "awaiting") {
        const next = begin(state, state.phase, state.round, now, settings);
        return { ok: true, state: bump(next), session: null };
      }
      return fail("invalid_transition");
    }

    case "pause": {
      if (state.status !== "running" || state.phase_ends_at === null) {
        return fail("invalid_transition");
      }
      const next: TimerState = {
        ...state,
        status: "paused",
        paused_remaining_ms: Math.max(0, state.phase_ends_at - now),
        phase_ends_at: null,
      };
      return { ok: true, state: bump(next), session: null };
    }

    case "resume": {
      if (state.status !== "paused" || state.paused_remaining_ms === null) {
        return fail("invalid_transition");
      }
      const next: TimerState = {
        ...state,
        status: "running",
        phase_ends_at: now + state.paused_remaining_ms,
        paused_remaining_ms: null,
      };
      return { ok: true, state: bump(next), session: null };
    }

    case "skip": {
      if (state.status === "idle") return fail("invalid_transition");
      const session = sessionFor(state, now, false);
      const following = nextPhase(state.phase, state.round, settings);
      const next = autoStarts(following.phase, settings)
        ? begin(state, following.phase, following.round, now, settings)
        : await_(state, following.phase, following.round);
      return { ok: true, state: bump(next), session };
    }

    case "end": {
      if (state.status === "idle") return fail("invalid_transition");
      const session = sessionFor(state, now, false);
      const next: TimerState = {
        ...state,
        status: "idle",
        phase: "focus",
        round: 1,
        phase_started_at: null,
        phase_ends_at: null,
        paused_remaining_ms: null,
        phase_total_ms: null,
        session_id: null,
      };
      return { ok: true, state: bump(next), session };
    }

    case "advance": {
      if (state.status !== "running" || state.phase_ends_at === null) {
        return fail("invalid_transition");
      }
      if (now < state.phase_ends_at) return fail("not_due");
      const endedAt = state.phase_ends_at;
      const total = state.phase_total_ms ?? 0;
      const session: TimerSessionRecord = {
        started_at: state.phase_started_at ?? endedAt - total,
        ended_at: endedAt,
        phase: state.phase,
        planned_seconds: Math.round(total / 1000),
        actual_seconds: Math.round(total / 1000),
        completed: true,
        round: state.round,
      };
      const following = nextPhase(state.phase, state.round, settings);
      const startAt = now - endedAt <= ADVANCE_GRACE_MS ? endedAt : now;
      const base: TimerState = {
        ...state,
        last_completed_phase: state.phase,
        last_completed_at: endedAt,
      };
      const next = autoStarts(following.phase, settings)
        ? begin(base, following.phase, following.round, startAt, settings)
        : await_(base, following.phase, following.round);
      return { ok: true, state: bump(next), session };
    }

    default:
      return fail("invalid_transition");
  }
}

/** Which actions the controls should offer in a state. */
export function availableActions(state: TimerState): TimerAction[] {
  switch (state.status) {
    case "idle":
      return ["start"];
    case "running":
      return ["pause", "skip", "end"];
    case "paused":
      return ["resume", "skip", "end"];
    case "awaiting":
      return ["start", "skip", "end"];
    default:
      return [];
  }
}

export function phaseLabel(phase: TimerPhase): string {
  return phase === "focus" ? "Focus" : phase === "short_break" ? "Short break" : "Long break";
}

/** "22:57" or "1:02:03". */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Push/notification copy for a completed phase. */
export function phaseEndMessage(
  completed: TimerPhase,
  next: TimerPhase,
  settings: TimerSettings,
): { title: string; body: string } {
  if (completed === "focus") {
    const minutes = next === "long_break" ? settings.long_break_min : settings.short_break_min;
    return { title: "Focus complete", body: `Focus complete. Time for a ${minutes}-minute break.` };
  }
  return { title: "Break over", body: "Break over. Ready for the next focus round." };
}
