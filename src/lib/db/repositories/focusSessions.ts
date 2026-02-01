import { generateId, now } from '@prabhask5/stellar-engine/utils';
import { engineCreate, engineUpdate, engineQuery, engineGet } from '@prabhask5/stellar-engine/data';
import type { FocusSession, FocusPhase } from '$lib/types';

export async function getActiveSession(userId: string): Promise<FocusSession | null> {
  const sessions = (await engineQuery(
    'focus_sessions',
    'user_id',
    userId
  )) as unknown as FocusSession[];

  // Find active session (not deleted and not ended)
  const active = sessions.find((s) => !s.deleted && !s.ended_at && s.status !== 'stopped');
  return active || null;
}

export async function getFocusSession(id: string): Promise<FocusSession | null> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session || session.deleted) return null;
  return session;
}

export async function createFocusSession(
  userId: string,
  focusDuration: number,
  breakDuration: number,
  totalCycles: number
): Promise<FocusSession> {
  const timestamp = now();
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

export async function pauseFocusSession(
  id: string,
  remainingMs: number
): Promise<FocusSession | undefined> {
  return updateFocusSession(id, {
    status: 'paused',
    phase_remaining_ms: remainingMs
  });
}

export async function resumeFocusSession(id: string): Promise<FocusSession | undefined> {
  const timestamp = now();
  return updateFocusSession(id, {
    status: 'running',
    phase_started_at: timestamp
  });
}

export async function stopFocusSession(
  id: string,
  currentFocusElapsedMinutes?: number
): Promise<FocusSession | undefined> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session) return undefined;

  // Calculate final elapsed duration
  let elapsedDuration = session.elapsed_duration || 0;
  if (currentFocusElapsedMinutes !== undefined) {
    elapsedDuration += currentFocusElapsedMinutes;
  }

  // Mark as stopped AND deleted so tombstone cleanup will eventually remove it
  const result = await engineUpdate('focus_sessions', id, {
    status: 'stopped',
    ended_at: now(),
    phase: 'idle',
    elapsed_duration: elapsedDuration,
    deleted: true
  });

  return result as unknown as FocusSession | undefined;
}

export async function advancePhase(
  id: string,
  newPhase: FocusPhase,
  newCycle: number,
  phaseDurationMs: number,
  previousFocusElapsedMinutes?: number
): Promise<FocusSession | undefined> {
  const session = (await engineGet('focus_sessions', id)) as unknown as FocusSession | undefined;
  if (!session) return undefined;

  // If we're advancing from a focus phase, add the elapsed time
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

  if (previousFocusElapsedMinutes !== undefined) {
    updates.elapsed_duration = (session.elapsed_duration || 0) + previousFocusElapsedMinutes;
  }

  return updateFocusSession(id, updates);
}

export async function getTodayFocusTime(userId: string): Promise<number> {
  // Get local midnight as ISO string for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Convert local midnight to ISO by accounting for timezone offset
  const localMidnightISO = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString();

  const sessions = (await engineQuery(
    'focus_sessions',
    'user_id',
    userId
  )) as unknown as FocusSession[];

  // Sum up focus time from sessions today using elapsed_duration
  // Note: We include deleted (stopped) sessions since they still count for today's focus time
  // The date filter handles excluding old sessions
  let totalMs = 0;
  for (const session of sessions) {
    if (session.started_at < localMidnightISO) continue;

    // Use elapsed_duration (actual time spent in focus phases)
    totalMs += (session.elapsed_duration || 0) * 60 * 1000;

    // For currently running focus phase, add current elapsed time
    if (!session.ended_at && session.phase === 'focus' && session.status === 'running') {
      const currentElapsed = Date.now() - new Date(session.phase_started_at).getTime();
      totalMs += Math.min(currentElapsed, session.focus_duration * 60 * 1000);
    }
  }

  return totalMs;
}
