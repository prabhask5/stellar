/**
 * @fileoverview Server Config API Endpoint — `/api/config`
 *
 * Reads Supabase environment variables at runtime via `process.env`.
 * On Vercel, `process.env` reads environment variables at **runtime** (not build time),
 * so this endpoint always reflects the latest configured values.
 *
 * Only serves the **public** anon key and URL — these are safe to expose
 * because Supabase Row-Level Security (RLS) enforces all access control.
 *
 * Used by the client-side setup flow to detect whether the app
 * has already been configured with valid Supabase credentials.
 */

// =============================================================================
//  IMPORTS
// =============================================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// =============================================================================
//  GET HANDLER — Return Supabase Configuration Status
// =============================================================================

/**
 * Checks whether Supabase environment variables are present and returns them.
 *
 * @returns A JSON response with `{ configured: true, supabaseUrl, supabaseAnonKey }`
 *          when both env vars exist, or `{ configured: false }` otherwise.
 */
export const GET: RequestHandler = async () => {
  /* ── Read runtime env vars ──── */
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

  /* ── Return credentials only when both are present ──── */
  if (supabaseUrl && supabaseAnonKey) {
    return json({
      configured: true,
      supabaseUrl,
      supabaseAnonKey
    });
  }

  /* Neither or only one var set → not configured */
  return json({ configured: false });
};
