/**
 * Extension Configuration
 *
 * Import values from config.local.ts (gitignored)
 * Copy config.local.example.ts to config.local.ts and fill in your values
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL } from './config.local';

export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  appUrl: APP_URL
} as const;
