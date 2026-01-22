-- Stellar Database Schema for Supabase
-- Copy and paste this entire file into your Supabase SQL Editor to set up a fresh database

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to automatically set user_id on insert
create or replace function set_user_id()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql set search_path = '';

-- ============================================================
-- TABLES: Goal Lists & Goals
-- ============================================================

create table goal_lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table goals (
  id uuid default uuid_generate_v4() primary key,
  goal_list_id uuid references goal_lists(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('completion', 'incremental')),
  target_value integer,
  current_value integer default 0 not null,
  completed boolean default false not null,
  "order" double precision default 0 not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- TABLES: Daily Routines & Progress
-- ============================================================

create table daily_routine_goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('completion', 'incremental')),
  target_value integer,
  start_date date not null,
  end_date date,
  active_days jsonb default null, -- Array of integers 0-6 (0=Sunday, 6=Saturday), null = all days
  "order" double precision default 0 not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table daily_goal_progress (
  id uuid default uuid_generate_v4() primary key,
  daily_routine_goal_id uuid references daily_routine_goals(id) on delete cascade not null,
  date date not null,
  current_value integer default 0 not null,
  completed boolean default false not null,
  deleted boolean default false not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(daily_routine_goal_id, date)
);

-- ============================================================
-- TABLES: Tasks Feature
-- ============================================================

create table task_categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6c5ce7',
  "order" double precision default 0 not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table commitments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  section text not null check (section in ('career', 'social', 'personal')),
  "order" double precision default 0 not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table daily_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  "order" double precision default 0 not null,
  completed boolean default false not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table long_term_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  due_date date not null,
  category_id uuid references task_categories(id) on delete set null,
  completed boolean default false not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Goal Lists & Goals
create index idx_goal_lists_user_id on goal_lists(user_id);
create index idx_goal_lists_updated_at on goal_lists(updated_at);
create index idx_goal_lists_deleted on goal_lists(deleted) where deleted = false;

create index idx_goals_goal_list_id on goals(goal_list_id);
create index idx_goals_order on goals("order");
create index idx_goals_updated_at on goals(updated_at);
create index idx_goals_deleted on goals(deleted) where deleted = false;

-- Daily Routines & Progress
create index idx_daily_routine_goals_user_id on daily_routine_goals(user_id);
create index idx_daily_routine_goals_order on daily_routine_goals("order");
create index idx_daily_routine_goals_updated_at on daily_routine_goals(updated_at);
create index idx_daily_routine_goals_deleted on daily_routine_goals(deleted) where deleted = false;

create index idx_daily_goal_progress_date on daily_goal_progress(date);
create index idx_daily_goal_progress_goal_id on daily_goal_progress(daily_routine_goal_id);
create index idx_daily_goal_progress_updated_at on daily_goal_progress(updated_at);
create index idx_daily_goal_progress_deleted on daily_goal_progress(deleted) where deleted = false;

-- Tasks
create index idx_task_categories_user_id on task_categories(user_id);
create index idx_task_categories_order on task_categories("order");
create index idx_task_categories_updated_at on task_categories(updated_at);
create index idx_task_categories_deleted on task_categories(deleted) where deleted = false;

create index idx_commitments_user_id on commitments(user_id);
create index idx_commitments_section on commitments(section);
create index idx_commitments_order on commitments("order");
create index idx_commitments_updated_at on commitments(updated_at);
create index idx_commitments_deleted on commitments(deleted) where deleted = false;

create index idx_daily_tasks_user_id on daily_tasks(user_id);
create index idx_daily_tasks_order on daily_tasks("order");
create index idx_daily_tasks_updated_at on daily_tasks(updated_at);
create index idx_daily_tasks_deleted on daily_tasks(deleted) where deleted = false;

create index idx_long_term_tasks_user_id on long_term_tasks(user_id);
create index idx_long_term_tasks_due_date on long_term_tasks(due_date);
create index idx_long_term_tasks_category_id on long_term_tasks(category_id);
create index idx_long_term_tasks_updated_at on long_term_tasks(updated_at);
create index idx_long_term_tasks_deleted on long_term_tasks(deleted) where deleted = false;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table goal_lists enable row level security;
alter table goals enable row level security;
alter table daily_routine_goals enable row level security;
alter table daily_goal_progress enable row level security;
alter table task_categories enable row level security;
alter table commitments enable row level security;
alter table daily_tasks enable row level security;
alter table long_term_tasks enable row level security;

-- ============================================================
-- RLS POLICIES: Goal Lists
-- ============================================================

create policy "Users can view their own goal lists"
  on goal_lists for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own goal lists"
  on goal_lists for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own goal lists"
  on goal_lists for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own goal lists"
  on goal_lists for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS POLICIES: Goals (via goal_list ownership)
-- ============================================================

create policy "Users can view their own goals"
  on goals for select
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can create their own goals"
  on goals for insert
  with check (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own goals"
  on goals for update
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own goals"
  on goals for delete
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- RLS POLICIES: Daily Routine Goals
-- ============================================================

create policy "Users can view their own daily routine goals"
  on daily_routine_goals for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own daily routine goals"
  on daily_routine_goals for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily routine goals"
  on daily_routine_goals for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own daily routine goals"
  on daily_routine_goals for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS POLICIES: Daily Goal Progress (via routine ownership)
-- ============================================================

create policy "Users can view their daily progress"
  on daily_goal_progress for select
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = (select auth.uid())
    )
  );

create policy "Users can create their daily progress"
  on daily_goal_progress for insert
  with check (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = (select auth.uid())
    )
  );

create policy "Users can update their daily progress"
  on daily_goal_progress for update
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their daily progress"
  on daily_goal_progress for delete
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- RLS POLICIES: Task Categories
-- ============================================================

create policy "Users can view their own task categories"
  on task_categories for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own task categories"
  on task_categories for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own task categories"
  on task_categories for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own task categories"
  on task_categories for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS POLICIES: Commitments
-- ============================================================

create policy "Users can view their own commitments"
  on commitments for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own commitments"
  on commitments for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own commitments"
  on commitments for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own commitments"
  on commitments for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS POLICIES: Daily Tasks
-- ============================================================

create policy "Users can view their own daily tasks"
  on daily_tasks for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own daily tasks"
  on daily_tasks for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily tasks"
  on daily_tasks for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own daily tasks"
  on daily_tasks for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS POLICIES: Long Term Tasks
-- ============================================================

create policy "Users can view their own long term tasks"
  on long_term_tasks for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own long term tasks"
  on long_term_tasks for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own long term tasks"
  on long_term_tasks for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own long term tasks"
  on long_term_tasks for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- TRIGGERS: Auto-set user_id on insert
-- ============================================================

create trigger set_goal_lists_user_id
  before insert on goal_lists
  for each row execute function set_user_id();

create trigger set_daily_routine_goals_user_id
  before insert on daily_routine_goals
  for each row execute function set_user_id();

create trigger set_task_categories_user_id
  before insert on task_categories
  for each row execute function set_user_id();

create trigger set_commitments_user_id
  before insert on commitments
  for each row execute function set_user_id();

create trigger set_daily_tasks_user_id
  before insert on daily_tasks
  for each row execute function set_user_id();

create trigger set_long_term_tasks_user_id
  before insert on long_term_tasks
  for each row execute function set_user_id();

-- ============================================================
-- TRIGGERS: Auto-update updated_at on row changes
-- ============================================================

create trigger update_goal_lists_updated_at
  before update on goal_lists
  for each row execute function update_updated_at_column();

create trigger update_goals_updated_at
  before update on goals
  for each row execute function update_updated_at_column();

create trigger update_daily_routine_goals_updated_at
  before update on daily_routine_goals
  for each row execute function update_updated_at_column();

create trigger update_daily_goal_progress_updated_at
  before update on daily_goal_progress
  for each row execute function update_updated_at_column();

create trigger update_task_categories_updated_at
  before update on task_categories
  for each row execute function update_updated_at_column();

create trigger update_commitments_updated_at
  before update on commitments
  for each row execute function update_updated_at_column();

create trigger update_daily_tasks_updated_at
  before update on daily_tasks
  for each row execute function update_updated_at_column();

create trigger update_long_term_tasks_updated_at
  before update on long_term_tasks
  for each row execute function update_updated_at_column();

-- ============================================================
-- TABLES: Focus Feature
-- ============================================================

create table focus_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  focus_duration integer default 25 not null,        -- minutes
  break_duration integer default 5 not null,         -- minutes
  long_break_duration integer default 15 not null,   -- minutes
  cycles_before_long_break integer default 4 not null,
  auto_start_breaks boolean default false not null,
  auto_start_focus boolean default false not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

create table focus_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  started_at timestamp with time zone not null,
  ended_at timestamp with time zone,
  phase text not null check (phase in ('focus', 'break', 'idle')),
  status text not null check (status in ('running', 'paused', 'stopped')),
  current_cycle integer default 1 not null,
  total_cycles integer default 4 not null,
  focus_duration integer not null,                   -- minutes
  break_duration integer not null,                   -- minutes
  phase_started_at timestamp with time zone not null,
  phase_remaining_ms bigint not null,                -- milliseconds remaining in current phase
  elapsed_duration integer default 0 not null,       -- total elapsed focus time in minutes
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- TABLES: Block Lists
-- ============================================================

create table block_lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  active_days jsonb default null,  -- Array of integers 0-6 (0=Sunday, 6=Saturday), null = all days
  is_enabled boolean default true not null,
  "order" double precision default 0 not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table blocked_websites (
  id uuid default uuid_generate_v4() primary key,
  block_list_id uuid references block_lists(id) on delete cascade not null,
  domain text not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- INDEXES: Focus Feature
-- ============================================================

create index idx_focus_settings_user_id on focus_settings(user_id);
create index idx_focus_settings_updated_at on focus_settings(updated_at);
create index idx_focus_settings_deleted on focus_settings(deleted) where deleted = false;

create index idx_focus_sessions_user_id on focus_sessions(user_id);
create index idx_focus_sessions_status on focus_sessions(status);
create index idx_focus_sessions_started_at on focus_sessions(started_at);
create index idx_focus_sessions_ended_at on focus_sessions(ended_at);
create index idx_focus_sessions_updated_at on focus_sessions(updated_at);
create index idx_focus_sessions_deleted on focus_sessions(deleted) where deleted = false;
-- Index for finding active sessions (ended_at IS NULL and status = 'running')
create index idx_focus_sessions_active on focus_sessions(user_id, ended_at) where ended_at is null;

-- ============================================================
-- INDEXES: Block Lists
-- ============================================================

create index idx_block_lists_user_id on block_lists(user_id);
create index idx_block_lists_order on block_lists("order");
create index idx_block_lists_updated_at on block_lists(updated_at);
create index idx_block_lists_deleted on block_lists(deleted) where deleted = false;

create index idx_blocked_websites_block_list_id on blocked_websites(block_list_id);
create index idx_blocked_websites_updated_at on blocked_websites(updated_at);
create index idx_blocked_websites_deleted on blocked_websites(deleted) where deleted = false;

-- ============================================================
-- RLS: Focus Settings
-- ============================================================

alter table focus_settings enable row level security;

create policy "Users can view their own focus settings"
  on focus_settings for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own focus settings"
  on focus_settings for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own focus settings"
  on focus_settings for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own focus settings"
  on focus_settings for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS: Focus Sessions
-- ============================================================

alter table focus_sessions enable row level security;

create policy "Users can view their own focus sessions"
  on focus_sessions for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own focus sessions"
  on focus_sessions for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own focus sessions"
  on focus_sessions for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own focus sessions"
  on focus_sessions for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS: Block Lists
-- ============================================================

alter table block_lists enable row level security;

create policy "Users can view their own block lists"
  on block_lists for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own block lists"
  on block_lists for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own block lists"
  on block_lists for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own block lists"
  on block_lists for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- RLS: Blocked Websites (via block_list ownership)
-- ============================================================

alter table blocked_websites enable row level security;

create policy "Users can view their own blocked websites"
  on blocked_websites for select
  using (
    exists (
      select 1 from block_lists
      where block_lists.id = blocked_websites.block_list_id
      and block_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can create their own blocked websites"
  on blocked_websites for insert
  with check (
    exists (
      select 1 from block_lists
      where block_lists.id = blocked_websites.block_list_id
      and block_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own blocked websites"
  on blocked_websites for update
  using (
    exists (
      select 1 from block_lists
      where block_lists.id = blocked_websites.block_list_id
      and block_lists.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own blocked websites"
  on blocked_websites for delete
  using (
    exists (
      select 1 from block_lists
      where block_lists.id = blocked_websites.block_list_id
      and block_lists.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- TRIGGERS: Focus Feature Auto-set user_id
-- ============================================================

create trigger set_focus_settings_user_id
  before insert on focus_settings
  for each row execute function set_user_id();

create trigger set_focus_sessions_user_id
  before insert on focus_sessions
  for each row execute function set_user_id();

create trigger set_block_lists_user_id
  before insert on block_lists
  for each row execute function set_user_id();

-- ============================================================
-- TRIGGERS: Focus Feature Auto-update updated_at
-- ============================================================

create trigger update_focus_settings_updated_at
  before update on focus_settings
  for each row execute function update_updated_at_column();

create trigger update_focus_sessions_updated_at
  before update on focus_sessions
  for each row execute function update_updated_at_column();

create trigger update_block_lists_updated_at
  before update on block_lists
  for each row execute function update_updated_at_column();

create trigger update_blocked_websites_updated_at
  before update on blocked_websites
  for each row execute function update_updated_at_column();

-- ============================================================
-- OPERATION-BASED SYNC FUNCTIONS
--
-- These functions enable atomic operations for multi-device
-- conflict resolution. Added in sync system redesign.
-- ============================================================

-- Function to atomically increment an integer field
-- Used for: goal progress, counters
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

GRANT EXECUTE ON FUNCTION apply_increment(TEXT, UUID, TEXT, INTEGER) TO authenticated;


-- Function to atomically toggle a boolean field
-- Used for: task completion, goal completion
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

GRANT EXECUTE ON FUNCTION apply_toggle(TEXT, UUID, TEXT) TO authenticated;


-- Function to check if any tables have updates since cursor
-- Used for: lightweight polling to minimize egress
CREATE OR REPLACE FUNCTION check_updates_since(
  p_cursor TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_has_updates BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
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

GRANT EXECUTE ON FUNCTION check_updates_since(TIMESTAMPTZ) TO authenticated;


-- Function to get the most recent updated_at across all tables
-- Used for: advancing sync cursor after pull
CREATE OR REPLACE FUNCTION get_latest_update_time()
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_user_id UUID;
  v_latest TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

GRANT EXECUTE ON FUNCTION get_latest_update_time() TO authenticated;
