/**
 * Offline Session Management for Firefox Extension
 * Handles creation, validation, and cleanup of offline sessions
 * Ported from main Stellar app
 */

import { offlineSessionStore, type OfflineSession } from '../lib/storage';
import { generateToken } from './crypto';

const SESSION_ID = 'current_session';

// Session duration in milliseconds (1 hour)
const SESSION_DURATION_MS = 60 * 60 * 1000;

/**
 * Create a new offline session
 * @param userId - The Supabase user ID
 * @returns The created session
 */
export async function createOfflineSession(userId: string): Promise<OfflineSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const session: OfflineSession = {
    id: SESSION_ID,
    userId: userId,
    offlineToken: generateToken(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await offlineSessionStore.put(session);
  return session;
}

/**
 * Get the current offline session
 * Returns null if no session exists
 */
export async function getOfflineSession(): Promise<OfflineSession | null> {
  const session = await offlineSessionStore.get(SESSION_ID);
  return session || null;
}

/**
 * Get a valid (non-expired) offline session
 * Returns null if no valid session exists
 */
export async function getValidOfflineSession(): Promise<OfflineSession | null> {
  const session = await getOfflineSession();
  if (!session) {
    return null;
  }

  // Check if session is expired
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (now >= expiresAt) {
    // Session expired - clear it
    await clearOfflineSession();
    return null;
  }

  return session;
}

/**
 * Check if there is a valid offline session
 */
export async function hasValidOfflineSession(): Promise<boolean> {
  const session = await getValidOfflineSession();
  return session !== null;
}

/**
 * Extend the offline session (refresh expiration)
 * Called when user is actively using the extension offline
 */
export async function extendOfflineSession(): Promise<void> {
  const session = await getOfflineSession();
  if (!session) {
    return;
  }

  const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const updatedSession: OfflineSession = {
    ...session,
    expiresAt: newExpiresAt.toISOString()
  };

  await offlineSessionStore.put(updatedSession);
}

/**
 * Clear the offline session (on logout or session invalidation)
 */
export async function clearOfflineSession(): Promise<void> {
  await offlineSessionStore.delete(SESSION_ID);
}

/**
 * Get session info for display purposes
 * Returns null if no valid session
 */
export async function getOfflineSessionInfo(): Promise<{
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  remainingMs: number;
} | null> {
  const session = await getValidOfflineSession();
  if (!session) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();

  return {
    userId: session.userId,
    createdAt: new Date(session.createdAt),
    expiresAt,
    remainingMs
  };
}
