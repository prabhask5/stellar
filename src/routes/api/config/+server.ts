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
//  Delegates entirely to `createConfigHandler()` from stellar-drive, which
//  reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` from
//  `process.env` and returns them with security headers (Cache-Control,
//  X-Content-Type-Options).
//
// =============================================================================

import { createConfigHandler } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * **GET /api/config** — Retrieve the current Supabase configuration.
 *
 * Factory-created handler that reads env vars and returns them as JSON
 * with appropriate security headers.
 *
 * @see {@link createConfigHandler} for implementation details.
 */
export const GET: RequestHandler = createConfigHandler();
