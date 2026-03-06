-- =============================================================================
-- Custom SQL for Stellar Planner
-- IMPORTANT: All statements MUST be idempotent (CREATE OR REPLACE, IF NOT
-- EXISTS, etc.) because this file is executed on every build.
-- =============================================================================

-- get_extension_config()
-- Returns the first auth user's email, gate type, code length, and profile.
-- Used by the stellar-focus browser extension and new devices to discover the
-- existing account without authentication (called with the publishable key).
CREATE OR REPLACE FUNCTION get_extension_config()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT json_build_object(
    'email', u.email,
    'gateType', 'code',
    'codeLength', COALESCE((u.raw_user_meta_data->>'code_length')::int, 6),
    'profile', json_build_object(
      'firstName', COALESCE(u.raw_user_meta_data->>'first_name', ''),
      'lastName', COALESCE(u.raw_user_meta_data->>'last_name', '')
    )
  )
  FROM auth.users u
  WHERE u.email IS NOT NULL
  ORDER BY u.created_at ASC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_extension_config() TO anon, authenticated;
