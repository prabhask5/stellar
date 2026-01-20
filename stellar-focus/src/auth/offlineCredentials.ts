/**
 * Offline Credentials Management for Firefox Extension
 * Handles caching, retrieval, and verification of user credentials for offline login
 * Ported from main Stellar app
 */

import { offlineCredentialsStore, type OfflineCredentials } from '../lib/storage';
import type { User, Session } from '@supabase/supabase-js';
import { hashPassword, generateSalt, verifyPassword } from './crypto';

const CREDENTIALS_ID = 'current_user';

/**
 * Cache user credentials for offline login
 * Called after successful Supabase login
 */
export async function cacheOfflineCredentials(
  email: string,
  password: string,
  user: User,
  session: Session
): Promise<void> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const credentials: OfflineCredentials = {
    id: CREDENTIALS_ID,
    userId: user.id,
    email: email,
    passwordHash: passwordHash,
    salt: salt,
    firstName: user.user_metadata?.first_name || '',
    lastName: user.user_metadata?.last_name || '',
    cachedAt: new Date().toISOString()
  };

  await offlineCredentialsStore.put(credentials);
}

/**
 * Get cached offline credentials
 * Returns null if no credentials are cached
 */
export async function getOfflineCredentials(): Promise<OfflineCredentials | null> {
  const credentials = await offlineCredentialsStore.get(CREDENTIALS_ID);
  return credentials || null;
}

/**
 * Verify a password against cached credentials
 * @returns true if password matches the cached hash
 */
export async function verifyOfflinePassword(password: string): Promise<boolean> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return false;
  }

  return verifyPassword(password, credentials.salt, credentials.passwordHash);
}

/**
 * Check if offline credentials exist for any user
 */
export async function hasOfflineCredentials(): Promise<boolean> {
  const credentials = await offlineCredentialsStore.get(CREDENTIALS_ID);
  return !!credentials;
}

/**
 * Clear all cached offline credentials (on logout)
 */
export async function clearOfflineCredentials(): Promise<void> {
  await offlineCredentialsStore.delete(CREDENTIALS_ID);
}
