import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { getValidOfflineSession } from '$lib/auth/offlineSession';
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
    // 1. Try Supabase session first
    const session = await getSession();
    if (session) {
      return { session, authMode: 'supabase', offlineProfile: null };
    }

    // 2. If offline, check for valid offline session
    if (!navigator.onLine) {
      const offlineSession = await getValidOfflineSession();
      if (offlineSession) {
        const profile = await getOfflineCredentials();
        return { session: null, authMode: 'offline', offlineProfile: profile };
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
