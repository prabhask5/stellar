/**
 * @fileoverview Focus (Pomodoro) timer utility functions.
 *
 * Pure helper functions for computing countdown values, formatting durations,
 * determining phase transitions, and generating the visual schedule timeline
 * for Stellar's Focus feature.
 *
 * All time arithmetic is performed in **milliseconds** internally, with
 * user-facing settings stored in **minutes**.  The conversion factor
 * `minutes * 60 * 1000` appears throughout.
 *
 * @see {@link FocusSession} — the persisted session record
 * @see {@link FocusSettings} — the user's Pomodoro configuration
 */

import type { FocusPhase, FocusSession, FocusSettings } from '$lib/types';

// =============================================================================
//                           DEFAULT SETTINGS
// =============================================================================

/**
 * Sensible defaults for a new user's Pomodoro configuration.
 *
 * These mirror the classic Pomodoro Technique values:
 * - 25 min focus / 5 min break / 15 min long break
 * - 4 cycles before a long break
 * - Manual start for both breaks and focus phases
 */
export const DEFAULT_FOCUS_SETTINGS = {
  focus_duration: 25,
  break_duration: 5,
  long_break_duration: 15,
  cycles_before_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false
};

// =============================================================================
//                        TIME CALCULATION HELPERS
// =============================================================================

/**
 * Calculate how many **milliseconds** remain in the current phase of a
 * {@link FocusSession}.
 *
 * - **Paused** → returns the frozen `phase_remaining_ms` directly.
 * - **Running** → subtracts wall-clock elapsed time from `phase_remaining_ms`.
 * - **Stopped / other** → returns `0`.
 *
 * The result is clamped to a minimum of `0` to prevent negative values when
 * the timer naturally expires between ticks.
 *
 * @param session - The current focus session.
 * @returns Remaining time in milliseconds (>= 0).
 */
export function calculateRemainingMs(session: FocusSession): number {
  if (session.status === 'paused') {
    return session.phase_remaining_ms;
  }

  if (session.status !== 'running') {
    return 0;
  }

  const phaseStartTime = new Date(session.phase_started_at).getTime();
  const now = Date.now();
  const elapsed = now - phaseStartTime;
  const remaining = session.phase_remaining_ms - elapsed;

  return Math.max(0, remaining);
}

// =============================================================================
//                          PHASE TRANSITIONS
// =============================================================================

/**
 * Determine the **next phase** after the current one completes.
 *
 * Transition rules:
 * - `focus` → `break` (short or long, depending on cycle count)
 * - `break` at last cycle → `idle` (session complete)
 * - `break` otherwise → `focus` (next cycle)
 *
 * @param session  - The current focus session.
 * @param settings - The user's focus settings (needed for long-break duration).
 * @returns An object describing the next `phase`, the `cycle` number, and the
 *          phase `durationMs` in milliseconds.
 */
export function getNextPhase(
  session: FocusSession,
  settings: FocusSettings
): {
  phase: FocusPhase;
  cycle: number;
  durationMs: number;
} {
  if (session.phase === 'focus') {
    /* ── Focus completed → transition to break ──── */
    const isLongBreak = session.current_cycle >= settings.cycles_before_long_break;
    const breakDurationMs = isLongBreak
      ? settings.long_break_duration * 60 * 1000
      : session.break_duration * 60 * 1000;

    return {
      phase: 'break',
      cycle: session.current_cycle,
      durationMs: breakDurationMs
    };
  }

  /* ── Break completed ──── */
  if (session.current_cycle >= session.total_cycles) {
    /* All cycles exhausted — session is done */
    return {
      phase: 'idle',
      cycle: session.current_cycle,
      durationMs: 0
    };
  }

  /* Start the next focus cycle */
  return {
    phase: 'focus',
    cycle: session.current_cycle + 1,
    durationMs: session.focus_duration * 60 * 1000
  };
}

// =============================================================================
//                         DISPLAY FORMATTING
// =============================================================================

/**
 * Format a millisecond value as `MM:SS` for the countdown display.
 *
 * Uses `Math.ceil` so the display never shows `00:00` while time remains
 * (the last visible second ticks from `00:01` to `00:00`).
 *
 * @param ms - Time in milliseconds.
 * @returns A zero-padded `"MM:SS"` string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format a millisecond value as a human-readable duration string.
 *
 * Examples: `"2h 15m"`, `"45m"`, `"1h"`.
 *
 * @param ms - Duration in milliseconds.
 * @returns A compact duration string omitting zero components.
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

// =============================================================================
//                         PROGRESS PERCENTAGE
// =============================================================================

/**
 * Calculate the elapsed-progress percentage for a timer phase.
 *
 * Returns `0` when `totalMs` is zero to avoid division-by-zero, and clamps
 * the result to `[0, 100]`.
 *
 * @param remainingMs - Milliseconds still remaining.
 * @param totalMs     - Total duration of the phase in milliseconds.
 * @returns A number between 0 and 100.
 */
export function calculateProgress(remainingMs: number, totalMs: number): number {
  if (totalMs === 0) return 0;
  const elapsed = totalMs - remainingMs;
  return Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
}

// =============================================================================
//                         SCHEDULE GENERATION
// =============================================================================

/**
 * Descriptor for a single phase slot in the visual session timeline.
 */
export interface SchedulePhase {
  /** Phase flavour — `'focus'`, `'break'`, or `'long_break'`. */
  type: 'focus' | 'break' | 'long_break';

  /** The 1-based cycle number this phase belongs to. */
  cycle: number;

  /** Duration of this phase in **minutes**. */
  durationMinutes: number;

  /** Whether this phase has already been completed. */
  isComplete: boolean;

  /** Whether this phase is the currently active one. */
  isCurrent: boolean;
}

/**
 * Generate the full schedule timeline for a focus session.
 *
 * Two modes of operation:
 *
 * 1. **No active session** (`session === null`) — builds a preview schedule
 *    from the user's {@link FocusSettings}, marking the first focus phase as
 *    `isCurrent`.
 *
 * 2. **Active session** — builds the schedule from the session's
 *    `total_cycles`, computing `isComplete` and `isCurrent` flags based on
 *    `current_cycle` and `phase`.
 *
 * Each cycle produces two entries: a `'focus'` phase followed by either a
 * `'break'` or `'long_break'` phase (the last cycle always gets a long break).
 *
 * @param session  - The active session, or `null` for preview mode.
 * @param settings - The user's Pomodoro configuration.
 * @returns An ordered array of {@link SchedulePhase} descriptors.
 */
export function generateSchedule(
  session: FocusSession | null,
  settings: FocusSettings
): SchedulePhase[] {
  if (!session) {
    /* ── Preview mode — build default schedule from settings ──── */
    const phases: SchedulePhase[] = [];
    const totalCycles = settings.cycles_before_long_break;

    for (let i = 1; i <= totalCycles; i++) {
      phases.push({
        type: 'focus',
        cycle: i,
        durationMinutes: settings.focus_duration,
        isComplete: false,
        isCurrent: i === 1 /* first focus phase is "current" in preview */
      });

      if (i === totalCycles) {
        /* Last cycle ends with a long break */
        phases.push({
          type: 'long_break',
          cycle: i,
          durationMinutes: settings.long_break_duration,
          isComplete: false,
          isCurrent: false
        });
      } else {
        phases.push({
          type: 'break',
          cycle: i,
          durationMinutes: settings.break_duration,
          isComplete: false,
          isCurrent: false
        });
      }
    }

    return phases;
  }

  /* ── Active session — derive completion / current state ──── */
  const phases: SchedulePhase[] = [];

  for (let i = 1; i <= session.total_cycles; i++) {
    /* ── Focus phase status ──── */
    const focusComplete =
      (session.phase === 'break' && session.current_cycle >= i) ||
      (session.phase === 'focus' && session.current_cycle > i) ||
      session.phase === 'idle';
    const focusCurrent = session.phase === 'focus' && session.current_cycle === i;

    phases.push({
      type: 'focus',
      cycle: i,
      durationMinutes: session.focus_duration,
      isComplete: focusComplete,
      isCurrent: focusCurrent
    });

    /* ── Break phase status ──── */
    const isLastCycle = i === session.total_cycles;
    const breakType = isLastCycle ? 'long_break' : 'break';
    const breakComplete =
      session.current_cycle > i || (session.phase === 'idle' && session.current_cycle >= i);
    const breakCurrent = session.phase === 'break' && session.current_cycle === i;

    phases.push({
      type: breakType,
      cycle: i,
      durationMinutes: isLastCycle ? settings.long_break_duration : session.break_duration,
      isComplete: breakComplete,
      isCurrent: breakCurrent
    });
  }

  return phases;
}

// =============================================================================
//                          PHASE DISPLAY TEXT
// =============================================================================

/**
 * Get a human-readable label for the current focus phase.
 *
 * @param phase       - The active {@link FocusPhase}.
 * @param isLongBreak - When `phase === 'break'`, distinguish between short
 *                      and long breaks (default: `false`).
 * @returns A display string — e.g. `"Focus Time"`, `"Short Break"`,
 *          `"Long Break"`, or `"Session Complete"`.
 */
export function getPhaseText(phase: FocusPhase, isLongBreak: boolean = false): string {
  switch (phase) {
    case 'focus':
      return 'Focus Time';
    case 'break':
      return isLongBreak ? 'Long Break' : 'Short Break';
    case 'idle':
      return 'Session Complete';
  }
}
