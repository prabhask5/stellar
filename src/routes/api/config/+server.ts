/**
 * Server Config API Endpoint
 *
 * Reads environment variables at runtime via process.env.
 * On Vercel, process.env reads environment variables at runtime (not build time).
 * Only serves the public anon key and URL (safe to expose, RLS enforces security).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

  if (supabaseUrl && supabaseAnonKey) {
    return json({
      configured: true,
      supabaseUrl,
      supabaseAnonKey
    });
  }

  return json({ configured: false });
};
