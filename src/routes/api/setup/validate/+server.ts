/**
 * Setup Validation Endpoint
 *
 * Tests connectivity to a Supabase project using provided credentials.
 */

import { json } from '@sveltejs/kit';
import { validateSupabaseCredentials } from '@prabhask5/stellar-engine';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { supabaseUrl, supabaseAnonKey } = await request.json();

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(
        { valid: false, error: 'Supabase URL and Anon Key are required' },
        { status: 400 }
      );
    }

    const result = await validateSupabaseCredentials(supabaseUrl, supabaseAnonKey);
    return json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ valid: false, error: `Could not connect to Supabase: ${message}` });
  }
};
