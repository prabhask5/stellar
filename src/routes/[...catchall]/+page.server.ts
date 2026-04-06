// =============================================================================
//  Stellar — Catch-All Route Handler (Home Redirect)
// =============================================================================
//
//  Unknown URLs should resolve back to `/` before any page component mounts.
//  Using a server-only redirect keeps the SPA shell out of the bad route
//  entirely, which avoids stale page state and intermediate-screen flicker.
//
// =============================================================================

import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(302, '/');
}
