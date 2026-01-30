/**
 * Admin Role System
 *
 * Admin flag is set via Supabase SQL:
 * UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb WHERE email = '..[USER_EMAIL]..';
 */

import type { User } from '@supabase/supabase-js';

/**
 * Check if a user has admin privileges.
 * Admin status is stored in app_metadata (set by Supabase service role, not user-editable).
 */
export function isAdmin(user: User | null): boolean {
  return user?.app_metadata?.is_admin === true;
}
