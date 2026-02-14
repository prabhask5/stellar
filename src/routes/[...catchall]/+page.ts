// =============================================================================
//  Stellar — Catch-All Route Handler (404 Redirect)
// =============================================================================
//
//  SvelteKit catch-all route that matches any URL not handled by other routes.
//  Instead of showing a 404 page, this redirects the user back to the home page
//  with a `302 Found` status — keeping the experience seamless.
//
//  Route pattern: `[...catchall]` → matches any path segments (e.g., `/foo/bar/baz`)
//
// =============================================================================

import { redirect } from '@sveltejs/kit';

/**
 * **Universal load function** — triggers a `302` redirect to the home page.
 *
 * Called by SvelteKit whenever a user navigates to a URL that doesn't match
 * any defined route. The `[...catchall]` param captures everything, so this
 * effectively turns unknown paths into a graceful redirect rather than a
 * hard 404 error.
 *
 * @returns Never returns — always throws a redirect
 */
export function load() {
  redirect(302, '/');
}
