// =============================================================================
//  Stellar — Catch-All Route Handler (Home Redirect)
// =============================================================================
//
//  Unknown URLs should still resolve to `/`, but a client-side redirect after
//  the route has already hydrated can leave the shell in a stale state. The
//  server path issues a normal HTTP redirect, while the client path lets the
//  page component perform a hard browser navigation.
//
// =============================================================================

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export function load() {
  if (!browser) {
    redirect(302, '/');
  }

  return {};
}
