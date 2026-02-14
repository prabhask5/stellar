/**
 * @fileoverview Setup Validation API Endpoint — `/api/setup/validate`
 *
 * Tests connectivity to a Supabase project using user-provided credentials.
 * Called during the first-run setup wizard to verify that the URL and anon key
 * are valid **before** persisting them as environment variables.
 *
 * Delegates the actual validation logic to `validateSupabaseCredentials`
 * from the `stellar-engine` package.
 */

// =============================================================================
//  IMPORTS
// =============================================================================

import { json } from '@sveltejs/kit';
import { validateSupabaseCredentials } from '@prabhask5/stellar-engine';
import type { RequestHandler } from './$types';

// =============================================================================
//  POST HANDLER — Validate Supabase Credentials
// =============================================================================

/**
 * Accepts a JSON body with `supabaseUrl` and `supabaseAnonKey`, then
 * attempts to connect to the Supabase instance to confirm the credentials work.
 *
 * @param request — The incoming `Request` object containing the JSON body.
 * @returns A JSON response with `{ valid: true }` on success,
 *          or `{ valid: false, error: string }` on failure.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    /* ── Extract credentials from request body ──── */
    const { supabaseUrl, supabaseAnonKey } = await request.json();

    /* ── Guard — both fields are required ──── */
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(
        { valid: false, error: 'Supabase URL and Anon Key are required' },
        { status: 400 }
      );
    }

    /* ── Delegate to stellar-engine for actual connectivity check ──── */
    const result = await validateSupabaseCredentials(supabaseUrl, supabaseAnonKey);
    return json(result);
  } catch (e) {
    /* ── Catch-all — surface a friendly error message ──── */
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ valid: false, error: `Could not connect to Supabase: ${message}` });
  }
};
