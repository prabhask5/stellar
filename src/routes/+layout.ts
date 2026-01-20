import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine, performSync } from '$lib/sync/engine';
import { getValidOfflineSession } from '$lib/auth/offlineSession';
import { getOfflineCredentials } from '$lib/auth/offlineCredentials';
import { callReconnectHandler } from '$lib/auth/reconnectHandler';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@supabase/supabase-js';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features once
if (browser) {
  // Initialize network status monitoring
  isOnline.init();

  // Register callback to sync when coming back online
  isOnline.onReconnect(async () => {
    console.log('[App] Back online - triggering sync and auth check');

    // First, check auth state on reconnect
    await callReconnectHandler();

    // Then sync data
    performSync();
  });
}

export interface LayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async (): Promise<LayoutData> => {
  if (browser) {
    try {
      // 1. Try Supabase session first (works online AND offline if not expired)
      const session = await getSession();

      if (session) {
        // Supabase session is valid - use it
        startSyncEngine();
        return { session, authMode: 'supabase', offlineProfile: null };
      }

      // 2. No Supabase session - check if offline
      if (!navigator.onLine) {
        // Offline - check for valid offline session
        const offlineSession = await getValidOfflineSession();

        if (offlineSession) {
          // Valid offline session exists - use it
          const profile = await getOfflineCredentials();
          return { session: null, authMode: 'offline', offlineProfile: profile };
        }
      }

      // 3. No valid session (online with no Supabase session, or offline with no valid offline session)
      return { session: null, authMode: 'none', offlineProfile: null };

    } catch (e) {
      // If session retrieval fails completely (corrupted auth state),
      // clear all Supabase auth data and return no session
      console.error('[Layout] Failed to get session, clearing auth state:', e);
      try {
        // Clear all Supabase auth storage
        const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch {
        // Ignore storage errors
      }
      return { session: null, authMode: 'none', offlineProfile: null };
    }
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
