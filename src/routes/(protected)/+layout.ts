/**
 * @fileoverview Protected Layout Load Function — Auth Guard
 *
 * Runs on every navigation into the `(protected)` route group.
 * Resolves the current authentication state via `stellar-engine` and
 * redirects unauthenticated users to `/login` (preserving the intended
 * destination as a `?redirect=` query parameter).
 *
 * On the server (SSR), returns a neutral "unauthenticated" payload so
 * that the actual auth check happens exclusively in the browser where
 * cookies / local storage are available.
 */

// =============================================================================
//  IMPORTS
// =============================================================================

import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { resolveAuthState } from '@prabhask5/stellar-engine/auth';
import type { AuthMode, OfflineCredentials, Session } from '@prabhask5/stellar-engine/types';
import type { LayoutLoad } from './$types';

// =============================================================================
//  TYPES
// =============================================================================

/**
 * Data shape returned by the protected layout's `load` function.
 *
 * @property session        — Active Supabase session, or `null` if offline / unauthenticated.
 * @property authMode       — Current auth mode: `'online'`, `'offline'`, or `'none'`.
 * @property offlineProfile — Cached offline credentials when in offline mode, otherwise `null`.
 */
export interface ProtectedLayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

// =============================================================================
//  LOAD FUNCTION — Auth Guard
// =============================================================================

/**
 * SvelteKit universal `load` function for the `(protected)` layout.
 *
 * - **Browser**: resolves the auth state; redirects to `/login` if `authMode` is `'none'`.
 * - **Server**: short-circuits with a neutral payload (auth is client-side only).
 *
 * @param url — The current page URL, used to build the redirect target.
 * @returns Resolved `ProtectedLayoutData` for downstream pages and layouts.
 */
export const load: LayoutLoad = async ({ url }): Promise<ProtectedLayoutData> => {
  if (browser) {
    /* ── Resolve authentication state from stellar-engine ──── */
    const result = await resolveAuthState();

    if (result.authMode === 'none') {
      /* Build login URL, preserving the user's intended destination */
      const returnUrl = url.pathname + url.search;
      const loginUrl =
        returnUrl && returnUrl !== '/'
          ? `/login?redirect=${encodeURIComponent(returnUrl)}`
          : '/login';
      throw redirect(302, loginUrl);
    }

    return result;
  }

  /* SSR fallback — no auth info available on the server */
  return { session: null, authMode: 'none', offlineProfile: null };
};
