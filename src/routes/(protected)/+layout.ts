import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { resolveAuthState } from '@prabhask5/stellar-engine/auth';
import type { AuthMode, OfflineCredentials, Session } from '@prabhask5/stellar-engine/types';
import type { LayoutLoad } from './$types';

export interface ProtectedLayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async ({ url }): Promise<ProtectedLayoutData> => {
  if (browser) {
    const result = await resolveAuthState();

    if (result.authMode === 'none') {
      const returnUrl = url.pathname + url.search;
      const loginUrl =
        returnUrl && returnUrl !== '/'
          ? `/login?redirect=${encodeURIComponent(returnUrl)}`
          : '/login';
      throw redirect(302, loginUrl);
    }

    return result;
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
