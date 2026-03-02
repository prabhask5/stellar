-- =============================================================================
-- Custom SQL for Stellar Planner
-- IMPORTANT: All statements MUST be idempotent (CREATE OR REPLACE, IF NOT
-- EXISTS, etc.) because this file is executed on every build.
-- =============================================================================

-- get_extension_config()
-- Returns the first auth user's email, gate type, code length, and profile.
-- Used by the stellar-focus browser extension and new devices to discover the
-- existing account without authentication (called with the anon/publishable key).
CREATE OR REPLACE FUNCTION public.get_extension_config()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'email', u.email,
    'gateType', COALESCE(u.raw_user_meta_data->>'gateType', 'code'),
    'codeLength', COALESCE((u.raw_user_meta_data->>'code_length')::int, 6),
    'profile', COALESCE(u.raw_user_meta_data->'profile', '{}'::jsonb)
  )
  FROM auth.users u
  LIMIT 1;
$$;
