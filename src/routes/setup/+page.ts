/**
 * Setup Page Access Control
 *
 * - If unconfigured: allow anyone (no auth exists yet)
 * - If configured: check if user is admin, redirect non-admins to /
 */

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { getConfig } from '@prabhask5/stellar-engine/config';
import { getValidSession, isAdmin } from '@prabhask5/stellar-engine/auth';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  if (!browser) return {};

  // If not configured, allow anyone (setup wizard needs to be accessible)
  if (!getConfig()) {
    return { isFirstSetup: true };
  }

  // Configured: only admins can access
  const session = await getValidSession();
  if (!session?.user) {
    redirect(307, '/login');
  }

  if (!isAdmin(session.user)) {
    redirect(307, '/');
  }

  return { isFirstSetup: false };
};
