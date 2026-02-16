/**
 * @fileoverview Protected Layout Load Function — Auth Guard
 *
 * Runs on every navigation into the `(protected)` route group.
 * Resolves the current authentication state via `stellar-drive` and
 * redirects unauthenticated users to `/login` (preserving the intended
 * destination as a `?redirect=` query parameter).
 *
 * On the server (SSR), returns a neutral "unauthenticated" payload so
 * that the actual auth check happens exclusively in the browser where
 * cookies / local storage are available.
 */

import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { resolveProtectedLayout } from 'stellar-drive/kit';
import type { ProtectedLayoutData } from 'stellar-drive/kit';
import type { LayoutLoad } from './$types';

export type { ProtectedLayoutData };

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
    const { data, redirectUrl } = await resolveProtectedLayout(url);

    if (redirectUrl) {
      throw redirect(302, redirectUrl);
    }

    return data;
  }

  /* SSR fallback — no auth info available on the server */
  return { session: null, authMode: 'none', offlineProfile: null };
};
