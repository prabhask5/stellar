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
    const { error } = await tempClient.from('focus_sessions').select('id').limit(1);

    if (error) {
      // Bad credentials
      if (error.message?.includes('Invalid API key') || error.code === 'PGRST301') {
        return json({ valid: false, error: 'Invalid Supabase credentials. Check your URL and Anon Key.' });
      }
      // Table doesn't exist but API is reachable — credentials work, schema not set up yet
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return json({ valid: true });
      }
      // Any other error — don't assume credentials are valid
      return json({ valid: false, error: `Supabase responded with an error: ${error.message}` });
    }

    return json({ valid: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ valid: false, error: `Could not connect to Supabase: ${message}` });
  }
};
