/**
 * @fileoverview Repository for **focus session** entities.
 *
 * A focus session represents a Pomodoro-style timer cycle that alternates
 * between `focus` and `break` phases.  This module manages the full session
 * lifecycle: create → pause/resume → advance phase → stop, as well as
 * aggregating today's total focus time for display.
 *
 * Session state machine:
 *   `running` ⇄ `paused` → `stopped`
 *
 * Phase progression:
 *   `focus` → `break` → `focus` → ... → `idle` (when stopped)
 *
 * Table: `focus_sessions`
 *
 * @module repositories/focusSessions
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import { engineCreate, engineUpdate, engineQuery, engineGet } from '@prabhask5/stellar-engine/data';
import type { FocusSession, FocusPhase } from '$lib/types';

// =============================================================================
//                             Read Operations
// =============================================================================

/**
 * Finds the currently active (running or paused) focus session for a user.
 *
 * A session is "active" when it has not been stopped and has no `ended_at`
 * timestamp.
 *
 * @param userId - The owning user's identifier
 * @returns The active {@link FocusSession}, or `null` if none is in progress
 */
export async function getActiveSession(userId: string): Promise<FocusSession | null> {
  const sessions = (await engineQuery(
    'focus_sessions',
    'user_id',
    userId
  )) as unknown as FocusSession[];

  /* ── Find the first non-deleted, non-ended, non-stopped session ──── */
  const active = sessions.find((s) => !s.deleted && !s.ended_at && s.status !== 'stopped');
  return active || null;
}

/**
 * Fetches a single focus session by ID.
 *
 * @param id - The session's unique identifier
 * @returns The {@link FocusSession}, or `null` if not found / deleted
 */
export async function getFocusSession(id: string): Promise<FocusSession | null> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session || session.deleted) return null;
  return session;
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new focus session and starts the first focus phase immediately.
 *
 * The session is initialised in `running` status at cycle 1, with
 * `phase_remaining_ms` set to the full focus duration.
 *
 * @param userId        - The owning user's identifier
 * @param focusDuration - Focus phase length in **minutes**
 * @param breakDuration - Break phase length in **minutes**
 * @param totalCycles   - Number of focus/break cycles before the session ends
 * @returns The newly created {@link FocusSession}
 */
export async function createFocusSession(
  userId: string,
  focusDuration: number,
  breakDuration: number,
  totalCycles: number
): Promise<FocusSession> {
  const timestamp = now();
  /** Focus duration converted from minutes → milliseconds */
  const focusDurationMs = focusDuration * 60 * 1000;

  const result = await engineCreate('focus_sessions', {
    id: generateId(),
    user_id: userId,
    started_at: timestamp,
    ended_at: null,
    phase: 'focus',
    status: 'running',
    current_cycle: 1,
    total_cycles: totalCycles,
    focus_duration: focusDuration,
    break_duration: breakDuration,
    phase_started_at: timestamp,
    phase_remaining_ms: focusDurationMs,
    elapsed_duration: 0,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as FocusSession;
}

/**
 * Generic update for focus session fields.
 *
 * Prefer the more specific helpers ({@link pauseFocusSession},
 * {@link resumeFocusSession}, {@link stopFocusSession},
 * {@link advancePhase}) for lifecycle transitions.
 *
 * @param id      - The session's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link FocusSession}, or `undefined` if not found
 */
export async function updateFocusSession(
  id: string,
  updates: Partial<
    Pick<
      FocusSession,
      | 'phase'
      | 'status'
      | 'current_cycle'
      | 'phase_started_at'
      | 'phase_remaining_ms'
      | 'ended_at'
      | 'elapsed_duration'
    >
  >
): Promise<FocusSession | undefined> {
  const result = await engineUpdate('focus_sessions', id, updates as Record<string, unknown>);
  return result as unknown as FocusSession | undefined;
}

// =============================================================================
//                       Lifecycle State Transitions
// =============================================================================

/**
 * Pauses a running focus session, snapshotting the remaining time.
 *
 * Stores `phase_remaining_ms` so the timer can resume from the exact point
 * where it was paused.
 *
 * @param id          - The session's unique identifier
 * @param remainingMs - Milliseconds remaining in the current phase
 * @returns The updated {@link FocusSession}, or `undefined` if not found
 */
export async function pauseFocusSession(
  id: string,
  remainingMs: number
): Promise<FocusSession | undefined> {
  return updateFocusSession(id, {
    status: 'paused',
    phase_remaining_ms: remainingMs
  });
}

/**
 * Resumes a paused focus session, recording the new phase start time.
 *
 * The phase timer restarts from `phase_remaining_ms` (set during pause)
 * using the fresh `phase_started_at` timestamp.
 *
 * @param id - The session's unique identifier
 * @returns The updated {@link FocusSession}, or `undefined` if not found
 */
export async function resumeFocusSession(id: string): Promise<FocusSession | undefined> {
  const timestamp = now();
  return updateFocusSession(id, {
    status: 'running',
    phase_started_at: timestamp
  });
}

/**
 * Stops a focus session permanently.
 *
 * The session is marked as `stopped` with phase set to `idle`, an `ended_at`
 * timestamp, and the `deleted` flag set to `true` so that tombstone cleanup
 * will eventually remove it from storage.
 *
 * Any remaining focus time from the current phase is added to
 * `elapsed_duration` before finalizing.
 *
 * @param id                        - The session's unique identifier
 * @param currentFocusElapsedMinutes - Minutes of focus time accrued in the
 *                                     current (incomplete) phase
 * @returns The updated {@link FocusSession}, or `undefined` if not found
 */
export async function stopFocusSession(
  id: string,
  currentFocusElapsedMinutes?: number
): Promise<FocusSession | undefined> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session) return undefined;

  /* ── Calculate final elapsed duration ──── */
  let elapsedDuration = session.elapsed_duration || 0;
  if (currentFocusElapsedMinutes !== undefined) {
    elapsedDuration += currentFocusElapsedMinutes;
  }

  /* ── Mark as stopped AND deleted for eventual tombstone cleanup ──── */
  const result = await engineUpdate('focus_sessions', id, {
    status: 'stopped',
    ended_at: now(),
    phase: 'idle',
    elapsed_duration: elapsedDuration,
    deleted: true
  });

  return result as unknown as FocusSession | undefined;
}

/**
 * Advances the session to the next phase (focus → break or break → focus).
 *
 * When advancing **from** a focus phase, the elapsed focus time is
 * accumulated into `elapsed_duration` for accurate daily total tracking.
 *
 * @param id                          - The session's unique identifier
 * @param newPhase                    - The phase to transition to
 * @param newCycle                    - The updated cycle counter
 * @param phaseDurationMs             - Duration of the new phase in milliseconds
 * @param previousFocusElapsedMinutes - Minutes of focus completed in the
 *                                      phase we're leaving (if it was a focus phase)
 * @returns The updated {@link FocusSession}, or `undefined` if not found
 */
export async function advancePhase(
  id: string,
  newPhase: FocusPhase,
  newCycle: number,
  phaseDurationMs: number,
  previousFocusElapsedMinutes?: number
): Promise<FocusSession | undefined> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session) return undefined;

  /* ── Build update payload ──── */
  const updates: Partial<
    Pick<
      FocusSession,
      | 'phase'
      | 'status'
      | 'current_cycle'
      | 'phase_started_at'
      | 'phase_remaining_ms'
      | 'ended_at'
      | 'elapsed_duration'
    >
  > = {
    phase: newPhase,
    current_cycle: newCycle,
    phase_started_at: now(),
    phase_remaining_ms: phaseDurationMs
  };

  /* ── Accumulate focus time from the phase we're leaving ──── */
  if (previousFocusElapsedMinutes !== undefined) {
    updates.elapsed_duration = (session.elapsed_duration || 0) + previousFocusElapsedMinutes;
  }

  return updateFocusSession(id, updates);
}

// =============================================================================
//                          Aggregate Queries
// =============================================================================

/**
 * Computes the total focus time for today in **milliseconds**.
 *
 * Iterates over all sessions started after local midnight and sums up:
 *   1. `elapsed_duration` — completed focus phases (stored in minutes,
 *      converted to ms)
 *   2. Live elapsed time — for any currently running focus phase, calculated
 *      from `phase_started_at` up to now, capped at `focus_duration`
 *
 * **Note:** Stopped/deleted sessions are intentionally included because
 * their focus time still counts toward today's total.
 *
 * @param userId - The owning user's identifier
 * @returns Total focus time today in milliseconds
 */
export async function getTodayFocusTime(userId: string): Promise<number> {
  /* ── Compute local midnight as ISO string for date filtering ──── */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /* Account for timezone offset so the ISO string represents local midnight */
  const localMidnightISO = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString();

  const sessions = (await engineQuery(
    'focus_sessions',
    'user_id',
    userId
  )) as unknown as FocusSession[];

  let totalMs = 0;
  for (const session of sessions) {
    /* ── Skip sessions from before today ──── */
    if (session.started_at < localMidnightISO) continue;

    /* ── Add completed focus time (minutes → ms) ──── */
    totalMs += (session.elapsed_duration || 0) * 60 * 1000;

    /* ── For currently running focus phases, add live elapsed time ──── */
    if (!session.ended_at && session.phase === 'focus' && session.status === 'running') {
      const currentElapsed = Date.now() - new Date(session.phase_started_at).getTime();
      /* Cap at focus_duration to prevent over-counting if the timer wasn't stopped */
      totalMs += Math.min(currentElapsed, session.focus_duration * 60 * 1000);
    }
  }

  return totalMs;
}
