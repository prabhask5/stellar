import { formatClock, isBlockingActive } from "@stellar/shared/timer";
import type { Snapshot } from "./types.ts";

export interface BlockDecision {
  block: boolean;
  /** When a running focus phase ends (local clock, ms). Blocking lifts then even with no network. */
  unblockAt: number | null;
  patterns: string[];
}

/** Local time at which the server-side `phase_ends_at` occurs. */
export function localEndsAt(snapshot: Snapshot): number | null {
  const iso = snapshot.state.phase_ends_at;
  return iso ? Date.parse(iso) - snapshot.skewMs : null;
}

/**
 * Whether to block right now, from the cached state alone:
 *  - focus + running: block until `phase_ends_at`, then stop (no network needed);
 *  - focus + paused: keep blocking until a state change arrives;
 *  - anything else (breaks, awaiting, idle): do not block.
 */
export function decide(snapshot: Snapshot | null, now: number): BlockDecision {
  if (!snapshot || !isBlockingActive(snapshot.state))
    return { block: false, unblockAt: null, patterns: [] };
  const patterns = snapshot.blocking.patterns;
  if (snapshot.state.status === "paused")
    return { block: patterns.length > 0, unblockAt: null, patterns };
  const endsAt = localEndsAt(snapshot);
  if (endsAt !== null && now >= endsAt) return { block: false, unblockAt: null, patterns: [] };
  return { block: patterns.length > 0, unblockAt: endsAt, patterns };
}

/** Time left in the current phase, ms (frozen while paused). */
export function remaining(snapshot: Snapshot, now: number): number {
  const { state } = snapshot;
  if (state.status === "paused") return Math.max(0, state.paused_remaining_ms ?? 0);
  if (state.status === "running") return Math.max(0, (localEndsAt(snapshot) ?? now) - now);
  if (state.status === "awaiting" || state.status === "idle") {
    const minutes =
      state.phase === "focus"
        ? snapshot.settings.focus_min
        : state.phase === "short_break"
          ? snapshot.settings.short_break_min
          : snapshot.settings.long_break_min;
    return minutes * 60_000;
  }
  return 0;
}

export interface Badge {
  text: string;
  color: string;
}

export const BADGE_FOCUS = "#F6C76E";
export const BADGE_BREAK = "#9D8CFF";

/** Toolbar badge: remaining minutes during focus (gold), "B" during breaks, nothing when idle. */
export function badgeFor(snapshot: Snapshot | null, now: number): Badge {
  if (!snapshot) return { text: "", color: BADGE_FOCUS };
  const { state } = snapshot;
  if (state.status === "idle" || state.status === "awaiting")
    return { text: "", color: BADGE_FOCUS };
  if (state.phase !== "focus") return { text: "B", color: BADGE_BREAK };
  if (state.status === "running" && (localEndsAt(snapshot) ?? 0) <= now)
    return { text: "", color: BADGE_FOCUS };
  return {
    text: String(Math.max(1, Math.ceil(remaining(snapshot, now) / 60_000))),
    color: BADGE_FOCUS,
  };
}

export function clock(snapshot: Snapshot, now: number): string {
  return formatClock(remaining(snapshot, now));
}
