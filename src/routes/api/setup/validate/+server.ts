/**
 * Setup Validation Endpoint
 *
 * Tests connectivity to a Supabase project using provided credentials.
 */

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { supabaseUrl, supabaseAnonKey } = await request.json();

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ valid: false, error: 'Supabase URL and Anon Key are required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(supabaseUrl);
    } catch {
      return json({ valid: false, error: 'Invalid Supabase URL format' }, { status: 400 });
    }

    // Create a temporary client and test connectivity
    const tempClient = createClient(supabaseUrl, supabaseAnonKey);

    // Test REST API reachability by attempting a simple query
    // This will fail with a specific error if the table doesn't exist, but succeeds if the API is reachable
    const { error } = await tempClient.from('focus_sessions').select('id').limit(1);

    if (error) {
      // "relation does not exist" means the API is reachable but tables aren't set up yet - that's OK for validation
      // "Invalid API key" or auth errors mean bad credentials
      if (error.message?.includes('Invalid API key') || error.code === 'PGRST301') {
        return json({ valid: false, error: 'Invalid Supabase credentials. Check your URL and Anon Key.' });
      }
      // Any other error from a reachable API is fine - credentials work
    }

    return json({ valid: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ valid: false, error: `Could not connect to Supabase: ${message}` });
  }
};
