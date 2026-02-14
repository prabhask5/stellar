/**
 * @fileoverview Setup page load function — access control gate.
 *
 * Determines whether the `/setup` route is accessible based on
 * the current configuration state and user privileges:
 *
 * - **Unconfigured** — Anyone may access (the setup wizard *must* be
 *   reachable before any auth backend exists).
 * - **Configured** — Only authenticated admin users are allowed;
 *   everyone else is redirected away.
 *
 * Returns `{ isFirstSetup: boolean }` so the page component can
 * toggle between first-time setup mode and admin reconfiguration mode.
 */

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { getConfig } from '@prabhask5/stellar-engine/config';
import { getValidSession, isAdmin } from '@prabhask5/stellar-engine/auth';
import type { PageLoad } from './$types';

/**
 * Universal (client-side) load function for the setup page.
 *
 * @returns An object with `isFirstSetup` — `true` when the app has
 *          no Supabase config yet, `false` for admin reconfiguration.
 */
export const load: PageLoad = async () => {
  /* ── SSR bail-out ──── */
  /* Config and session helpers rely on browser APIs (IndexedDB, etc.) */
  if (!browser) return {};

  // =============================================================================
  //  Unconfigured — first-time setup, publicly accessible
  // =============================================================================
  if (!getConfig()) {
    return { isFirstSetup: true };
  }

  // =============================================================================
  //  Configured — restrict to admins only
  // =============================================================================
  const session = await getValidSession();

  /* No valid session → send to login */
  if (!session?.user) {
    redirect(307, '/login');
  }

  /* Authenticated but not admin → send home */
  if (!isAdmin(session.user)) {
    redirect(307, '/');
  }

  return { isFirstSetup: false };
};
