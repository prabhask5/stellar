// =============================================================================
//  Stellar — Vercel Deploy API Endpoint
// =============================================================================
//
//  Persists Supabase credentials as Vercel environment variables and
//  triggers a production redeployment so the new config takes effect.
//
//  Called by the setup wizard after the user validates their Supabase
//  project. The endpoint:
//    1. Validates that all required fields are present.
//    2. Ensures `VERCEL_PROJECT_ID` exists (this endpoint only works
//       when the app is hosted on Vercel).
//    3. Delegates to `deployToVercel()` from stellar-drive, which
//       sets the env vars via the Vercel API and creates a new deployment.
//
// =============================================================================

import { json } from '@sveltejs/kit';
import { deployToVercel } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * **POST /api/setup/deploy** — Deploy Supabase config to Vercel.
 *
 * Expects a JSON body with:
 * - `supabaseUrl` — The project's Supabase REST URL
 * - `supabaseAnonKey` — The project's Supabase anonymous/public key
 * - `vercelToken` — A Vercel personal access token with deploy permissions
 *
 * Writes `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` as Vercel
 * env vars, then triggers a production redeployment.
 *
 * @returns JSON `{ success: true }` on success, or
 *          `{ success: false, error: string }` on failure.
 */
export const POST: RequestHandler = async ({ request }) => {
  /* ── Parse and validate request body ──── */
  const { supabaseUrl, supabaseAnonKey, vercelToken } = await request.json();

  if (!supabaseUrl || !supabaseAnonKey || !vercelToken) {
    return json(
      { success: false, error: 'Supabase URL, Anon Key, and Vercel Token are required' },
      { status: 400 }
    );
  }

  /* ── Ensure we're running on Vercel ──── */
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) {
    return json(
      {
        success: false,
        error: 'VERCEL_PROJECT_ID not found. This endpoint only works on Vercel deployments.'
      },
      { status: 400 }
    );
  }

  /* ── Delegate to engine — sets env vars + redeploys ──── */
  const result = await deployToVercel({ vercelToken, projectId, supabaseUrl, supabaseAnonKey });
  return json(result);
};
