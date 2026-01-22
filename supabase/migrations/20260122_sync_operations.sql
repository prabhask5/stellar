-- ============================================================
-- MIGRATION: Add Operation-Based Sync Functions
--
-- This migration adds PostgreSQL functions for atomic operations
-- that enable proper multi-device conflict resolution.
--
-- Safe to run on existing databases - adds new functions only.
-- ============================================================

-- ============================================================
-- FUNCTION: apply_increment
--
-- Atomically increments an integer field on any table.
-- Used for goal progress, counters, etc.
-- Returns the updated row as JSONB.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_increment(
  p_table TEXT,
  p_id UUID,
  p_field TEXT,
  p_delta INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_allowed_tables TEXT[] := ARRAY[
    'goals', 'daily_goal_progress'
  ];
  v_allowed_fields TEXT[] := ARRAY[
    'current_value'
  ];
BEGIN
  -- Security: Validate table name against whitelist
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for increment operations', p_table;
  END IF;

  -- Security: Validate field name against whitelist
  IF NOT (p_field = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field % is not allowed for increment operations', p_field;
  END IF;

  -- Apply delta atomically and return updated row
  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I, 0) + $1, updated_at = timezone(''utc''::text, now())
     WHERE id = $2
     RETURNING to_jsonb(%I.*)',
    p_table, p_field, p_field, p_table
  ) INTO v_result USING p_delta, p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Entity % not found in table %', p_id, p_table;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION apply_increment(TEXT, UUID, TEXT, INTEGER) TO authenticated;


-- ============================================================
-- FUNCTION: apply_toggle
--
-- Atomically toggles a boolean field on any table.
-- Used for task completion, goal completion, etc.
-- Returns the updated row as JSONB.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_toggle(
  p_table TEXT,
  p_id UUID,
  p_field TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_allowed_tables TEXT[] := ARRAY[
    'goals', 'daily_goal_progress', 'daily_tasks', 'long_term_tasks'
  ];
  v_allowed_fields TEXT[] := ARRAY[
    'completed'
  ];
BEGIN
  -- Security: Validate table name against whitelist
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for toggle operations', p_table;
  END IF;

  -- Security: Validate field name against whitelist
  IF NOT (p_field = ANY(v_allowed_fields)) THEN
    RAISE EXCEPTION 'Field % is not allowed for toggle operations', p_field;
  END IF;

  -- Toggle field atomically and return updated row
  EXECUTE format(
    'UPDATE %I SET %I = NOT COALESCE(%I, false), updated_at = timezone(''utc''::text, now())
     WHERE id = $1
     RETURNING to_jsonb(%I.*)',
    p_table, p_field, p_field, p_table
  ) INTO v_result USING p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Entity % not found in table %', p_id, p_table;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION apply_toggle(TEXT, UUID, TEXT) TO authenticated;


-- ============================================================
-- FUNCTION: check_updates_since
--
-- Lightweight check if any tables have updates since a cursor.
-- Returns true/false to minimize egress for polling.
-- ============================================================

CREATE OR REPLACE FUNCTION check_updates_since(
  p_cursor TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_has_updates BOOLEAN := false;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check all user-owned tables for updates
  -- Uses EXISTS for early termination (stops at first match)
  SELECT EXISTS (
    -- Direct user-owned tables
    SELECT 1 FROM goal_lists
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM daily_routine_goals
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM task_categories
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM commitments
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM daily_tasks
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM long_term_tasks
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM focus_settings
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM focus_sessions
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM block_lists
      WHERE user_id = v_user_id AND updated_at > p_cursor
    UNION ALL
    -- Child tables (joined via parent ownership)
    SELECT 1 FROM goals g
      JOIN goal_lists gl ON g.goal_list_id = gl.id
      WHERE gl.user_id = v_user_id AND g.updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM daily_goal_progress dgp
      JOIN daily_routine_goals drg ON dgp.daily_routine_goal_id = drg.id
      WHERE drg.user_id = v_user_id AND dgp.updated_at > p_cursor
    UNION ALL
    SELECT 1 FROM blocked_websites bw
      JOIN block_lists bl ON bw.block_list_id = bl.id
      WHERE bl.user_id = v_user_id AND bw.updated_at > p_cursor
    LIMIT 1
  ) INTO v_has_updates;

  RETURN v_has_updates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_updates_since(TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- FUNCTION: get_latest_update_time
--
-- Returns the most recent updated_at across all user's tables.
-- Used to advance sync cursor after pull.
-- ============================================================

CREATE OR REPLACE FUNCTION get_latest_update_time()
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_user_id UUID;
  v_latest TIMESTAMPTZ;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get max updated_at across all tables
  SELECT MAX(latest) INTO v_latest FROM (
    SELECT MAX(updated_at) as latest FROM goal_lists WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM daily_routine_goals WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM task_categories WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM commitments WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM daily_tasks WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM long_term_tasks WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM focus_settings WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM focus_sessions WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(updated_at) FROM block_lists WHERE user_id = v_user_id
    UNION ALL
    SELECT MAX(g.updated_at) FROM goals g
      JOIN goal_lists gl ON g.goal_list_id = gl.id WHERE gl.user_id = v_user_id
    UNION ALL
    SELECT MAX(dgp.updated_at) FROM daily_goal_progress dgp
      JOIN daily_routine_goals drg ON dgp.daily_routine_goal_id = drg.id
      WHERE drg.user_id = v_user_id
    UNION ALL
    SELECT MAX(bw.updated_at) FROM blocked_websites bw
      JOIN block_lists bl ON bw.block_list_id = bl.id WHERE bl.user_id = v_user_id
  ) as all_times;

  RETURN COALESCE(v_latest, '1970-01-01T00:00:00Z'::timestamptz);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_latest_update_time() TO authenticated;
