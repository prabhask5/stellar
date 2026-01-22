import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getSession, isSessionExpired } from '$lib/supabase/auth';
import { getValidOfflineSession, createOfflineSession } from '$lib/auth/offlineSession';
import { getOfflineCredentials } from '$lib/auth/offlineCredentials';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@supabase/supabase-js';
import type { LayoutLoad } from './$types';

export interface ProtectedLayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async ({ url }): Promise<ProtectedLayoutData> => {
  if (browser) {
    const isOffline = !navigator.onLine;

    // 1. Try Supabase session first
    try {
      const session = await getSession();

      if (session) {
        // Check if session is expired
        if (isSessionExpired(session)) {
          console.log('[Auth] Supabase session expired');

          if (isOffline) {
            // Offline with expired Supabase session → create/use offline session
            console.log('[Auth] Offline with expired session - using offline mode');
            const credentials = await getOfflineCredentials();
            if (credentials) {
              // Create offline session from cached credentials
              await createOfflineSession(credentials.userId);
              return { session: null, authMode: 'offline', offlineProfile: credentials };
            }
          }
          // Online with expired session → will be handled by Supabase refresh or redirect to login
        } else {
          // Valid Supabase session - use it
          return { session, authMode: 'supabase', offlineProfile: null };
        }
      }
    } catch (e) {
      console.warn('[Auth] Session check failed:', e);
      // If offline, continue to offline fallback
      if (!isOffline) {
        // Online but session check failed - redirect to login
        throw redirect(302, '/login');
      }
    }

    // 2. If offline, check for valid offline session or create one from cached credentials
    if (isOffline) {
      try {
        // First check if we have a valid offline session
        let offlineSession = await getValidOfflineSession();

        if (!offlineSession) {
          // No valid offline session - try to create one from cached credentials
          const credentials = await getOfflineCredentials();
          if (credentials) {
            console.log('[Auth] Creating offline session from cached credentials');
            offlineSession = await createOfflineSession(credentials.userId);
          }
        }

        if (offlineSession) {
          const profile = await getOfflineCredentials();
          return { session: null, authMode: 'offline', offlineProfile: profile };
        }
      } catch (e) {
        console.warn('[Auth] Offline session check/create failed:', e);
      }
    }

    // 3. No valid session - redirect to login with return URL
    const returnUrl = url.pathname + url.search;
    const loginUrl = returnUrl && returnUrl !== '/'
      ? `/login?redirect=${encodeURIComponent(returnUrl)}`
      : '/login';
    throw redirect(302, loginUrl);
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
