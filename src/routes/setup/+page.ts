/**
 * @fileoverview Setup page load function — access control gate.
 *
 * Determines whether the `/setup` route is accessible based on
 * the current configuration state and authentication:
 *
 * - **Unconfigured** — Anyone may access (the setup wizard *must* be
 *   reachable before any auth backend exists).
 * - **Configured** — Only authenticated users are allowed;
 *   everyone else is redirected away.
 *
 * Returns `{ isFirstSetup: boolean }` so the page component can
 * toggle between first-time setup mode and reconfiguration mode.
 */

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { resolveSetupAccess } from 'stellar-drive/kit';
import type { PageLoad } from './$types';

/**
 * Universal (client-side) load function for the setup page.
 *
 * @returns An object with `isFirstSetup` — `true` when the app has
 *          no Supabase config yet, `false` for reconfiguration.
 */
export const load: PageLoad = async () => {
  /* Config and session helpers rely on browser APIs (IndexedDB, etc.) */
  if (!browser) return {};

  const { data, redirectUrl } = await resolveSetupAccess();

  if (redirectUrl) {
    redirect(307, redirectUrl);
  }

  return data;
};
