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
$$ language plpgsql security definer;

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

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
  using (auth.uid() = user_id);

create policy "Users can create their own goal lists"
  on goal_lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goal lists"
  on goal_lists for update
  using (auth.uid() = user_id);

create policy "Users can delete their own goal lists"
  on goal_lists for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: Goals (via goal_list ownership)
-- ============================================================

create policy "Users can view goals in their lists"
  on goals for select
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can create goals in their lists"
  on goals for insert
  with check (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can update goals in their lists"
  on goals for update
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can delete goals in their lists"
  on goals for delete
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES: Daily Routine Goals
-- ============================================================

create policy "Users can view their own daily routine goals"
  on daily_routine_goals for select
  using (auth.uid() = user_id);

create policy "Users can create their own daily routine goals"
  on daily_routine_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own daily routine goals"
  on daily_routine_goals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own daily routine goals"
  on daily_routine_goals for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: Daily Goal Progress (via routine ownership)
-- ============================================================

create policy "Users can view their daily progress"
  on daily_goal_progress for select
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can create their daily progress"
  on daily_goal_progress for insert
  with check (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can update their daily progress"
  on daily_goal_progress for update
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can delete their daily progress"
  on daily_goal_progress for delete
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES: Task Categories
-- ============================================================

create policy "Users can view their own task categories"
  on task_categories for select
  using (auth.uid() = user_id);

create policy "Users can create their own task categories"
  on task_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task categories"
  on task_categories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own task categories"
  on task_categories for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: Commitments
-- ============================================================

create policy "Users can view their own commitments"
  on commitments for select
  using (auth.uid() = user_id);

create policy "Users can create their own commitments"
  on commitments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own commitments"
  on commitments for update
  using (auth.uid() = user_id);

create policy "Users can delete their own commitments"
  on commitments for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: Daily Tasks
-- ============================================================

create policy "Users can view their own daily tasks"
  on daily_tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own daily tasks"
  on daily_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own daily tasks"
  on daily_tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own daily tasks"
  on daily_tasks for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: Long Term Tasks
-- ============================================================

create policy "Users can view their own long term tasks"
  on long_term_tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own long term tasks"
  on long_term_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own long term tasks"
  on long_term_tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own long term tasks"
  on long_term_tasks for delete
  using (auth.uid() = user_id);

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
