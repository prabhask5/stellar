import { db, generateId, now } from '../client';
import type { FocusSession, FocusPhase, FocusStatus } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function getActiveSession(userId: string): Promise<FocusSession | null> {
  const sessions = await db.focusSessions
    .where('user_id')
    .equals(userId)
    .toArray();

  // Find active session (not deleted and not ended)
  const active = sessions.find(s => !s.deleted && !s.ended_at && s.status !== 'stopped');
  return active || null;
}

export async function getFocusSession(id: string): Promise<FocusSession | null> {
  const session = await db.focusSessions.get(id);
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

  const newSession: FocusSession = {
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
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.focusSessions, db.syncQueue], async () => {
    await db.focusSessions.add(newSession);
    await queueSyncDirect('focus_sessions', 'create', newSession.id, {
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
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newSession;
}

export async function updateFocusSession(
  id: string,
  updates: Partial<Pick<FocusSession, 'phase' | 'status' | 'current_cycle' | 'phase_started_at' | 'phase_remaining_ms' | 'ended_at'>>
): Promise<FocusSession | undefined> {
  const timestamp = now();

  await db.focusSessions.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.focusSessions.get(id);
  if (!updated) return undefined;

  await queueSync('focus_sessions', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function pauseFocusSession(id: string, remainingMs: number): Promise<FocusSession | undefined> {
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

export async function stopFocusSession(id: string): Promise<FocusSession | undefined> {
  const timestamp = now();
  return updateFocusSession(id, {
    status: 'stopped',
    ended_at: timestamp,
    phase: 'idle'
  });
}

export async function advancePhase(
  id: string,
  newPhase: FocusPhase,
  newCycle: number,
  phaseDurationMs: number
): Promise<FocusSession | undefined> {
  const timestamp = now();
  return updateFocusSession(id, {
    phase: newPhase,
    current_cycle: newCycle,
    phase_started_at: timestamp,
    phase_remaining_ms: phaseDurationMs
  });
}

export async function getTodayFocusTime(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const sessions = await db.focusSessions
    .where('user_id')
    .equals(userId)
    .toArray();

  // Sum up focus time from completed sessions today
  let totalMs = 0;
  for (const session of sessions) {
    if (session.deleted) continue;
    if (session.started_at < todayStr) continue;

    // Count completed focus phases (cycles)
    // Each completed cycle contributes focus_duration minutes
    if (session.ended_at) {
      // Session is complete - count all cycles completed
      const completedCycles = session.phase === 'idle' ? session.current_cycle : session.current_cycle - 1;
      totalMs += completedCycles * session.focus_duration * 60 * 1000;
    }
  }

  return totalMs;
}
