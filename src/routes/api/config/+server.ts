// =============================================================================
//  Stellar — Config API Endpoint
// =============================================================================
//
//  Returns the server-side Supabase configuration to the client.
//
//  The client calls this endpoint on initial load to discover whether
//  Supabase has been configured (i.e., environment variables are present).
//  If not, the client redirects to the `/setup` wizard.
//
//  Delegates entirely to `getServerConfig()` from stellar-drive, which
//  reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` from
//  `process.env` and returns them (or `null` values when unconfigured).
//
// =============================================================================

import { json } from '@sveltejs/kit';
import { getServerConfig } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * **GET /api/config** — Retrieve the current Supabase configuration.
 *
 * Reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` from the
 * server environment and returns them as JSON. The client uses this to
 * initialise the Supabase client or detect that setup is required.
 *
 * @returns JSON payload with `{ supabaseUrl, supabasePublishableKey }` (values
 *          may be `null` if the environment is unconfigured).
 */
export const GET: RequestHandler = async () => {
  return json(getServerConfig());
};
