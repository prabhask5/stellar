/**
 * Setup Page Access Control
 *
 * - If unconfigured: allow anyone (no auth exists yet)
 * - If configured: check if user is admin, redirect non-admins to /
 */

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { isConfigured } from '$lib/config/runtimeConfig';
import { getSession } from '$lib/supabase/auth';
import { isAdmin } from '$lib/auth/admin';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  if (!browser) return {};

  // If not configured, allow anyone (setup wizard needs to be accessible)
  if (!isConfigured()) {
    return { isFirstSetup: true };
  }

  // Configured: only admins can access
  const session = await getSession();
  if (!session?.user) {
    redirect(307, '/login');
  }

  if (!isAdmin(session.user)) {
    redirect(307, '/');
  }

  return { isFirstSetup: false };
};
