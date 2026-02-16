// =============================================================================
//  Stellar — Supabase Credential Validation Endpoint
// =============================================================================
//
//  Validates a pair of Supabase credentials (URL + anon key) by making
//  a lightweight test request to the Supabase REST API.
//
//  Called by the setup wizard's "Validate" step before persisting the
//  credentials. Delegates entirely to `createValidateHandler()` from
//  stellar-drive, which:
//    1. Reads `supabaseUrl` and `supabaseAnonKey` from the JSON body.
//    2. Attempts a Supabase client connection.
//    3. Returns `{ valid: true }` or `{ valid: false, error: string }`.
//
// =============================================================================

import { createValidateHandler } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * **POST /api/setup/validate** — Test Supabase credentials.
 *
 * Factory-created handler that validates the provided Supabase URL and
 * anon key by attempting a real connection. Returns a JSON response
 * indicating whether the credentials are valid.
 *
 * @see {@link createValidateHandler} for implementation details.
 */
export const POST: RequestHandler = createValidateHandler();
