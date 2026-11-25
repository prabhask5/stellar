-- 0012: upcoming events. A named date (optionally with a time) the Goals page counts
-- down to. Idempotent like every migration.

create table if not exists public.sp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📅',
  -- The owner's calendar day, and optionally a wall-clock time on it. Both are read in
  -- the owner's time zone (sp_settings.timezone), like a task's due date and time.
  date date not null,
  time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_events_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint sp_events_emoji_chk check (char_length(emoji) between 1 and 32)
);
create index if not exists sp_events_user_idx on public.sp_events (user_id, date);
create index if not exists sp_events_updated_idx on public.sp_events (user_id, updated_at);

create or replace function public.sp_events_before()
returns trigger language plpgsql as $fn$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_events_before on public.sp_events;
create trigger sp_events_before before insert or update on public.sp_events
  for each row execute function public.sp_events_before();

-- Events are deleted for good; the tombstone lets a client that syncs by "changed since"
-- learn that one is gone.
drop trigger if exists sp_events_tombstone on public.sp_events;
create trigger sp_events_tombstone after delete on public.sp_events
  for each row execute function public.sp_record_tombstone();

alter table public.sp_events enable row level security;
drop policy if exists sp_events_owner on public.sp_events;
create policy sp_events_owner on public.sp_events
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_events from anon;
grant select, insert, update, delete on public.sp_events to authenticated;
grant all on public.sp_events to service_role;

-- ── realtime ───────────────────────────────────────────────────────────────
do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sp_events') then
    alter publication supabase_realtime add table public.sp_events;
  end if;
  -- Full row images so UPDATE/DELETE events carry user_id for filtering.
  alter table public.sp_events replica identity full;
end;
$do$;

-- ── export / import ────────────────────────────────────────────────────────
-- The same functions as before, with events added. Older exports have no `events` key.
create or replace function public.sp_export()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'format', 'stellar-planner-export',
    'format_version', 1,
    'schema_version', (select max(version) from public.sp_schema_version),
    'exported_at', now(),
    'settings', (select to_jsonb(s) - 'user_id' from public.sp_settings s where s.user_id = v_user),
    'focus_settings', (select to_jsonb(s) - 'user_id' from public.sp_focus_settings s where s.user_id = v_user),
    'task_lists', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_task_lists x where x.user_id = v_user),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_tasks x where x.user_id = v_user),
    'goal_lists', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_goal_lists x where x.user_id = v_user),
    'goals', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_goals x where x.user_id = v_user),
    'routines', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_routines x where x.user_id = v_user),
    'routine_logs', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_routine_logs x where x.user_id = v_user),
    'block_lists', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_block_lists x where x.user_id = v_user),
    'block_list_sites', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_block_list_sites x where x.user_id = v_user),
    'focus_sessions', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_focus_sessions x where x.user_id = v_user),
    'quotes', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_quotes x where x.user_id = v_user and not x.is_builtin),
    'events', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_events x where x.user_id = v_user)
  );
end;
$fn$;

-- Merges an export into the caller's account. Rows are matched by id, so importing
-- the same file twice changes nothing. Older exports still carry `universe_events`;
-- that key is ignored.
create or replace function public.sp_import(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n int;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if coalesce(p_data ->> 'format', '') <> 'stellar-planner-export' then
    raise exception 'This file is not a Stellar Planner export' using errcode = '22023';
  end if;
  if coalesce((p_data ->> 'format_version')::int, 0) <> 1 then
    raise exception 'Unsupported export version' using errcode = '22023';
  end if;

  if jsonb_typeof(p_data -> 'settings') = 'object' then
    insert into public.sp_settings as t (user_id, timezone, week_start, birthdate, lifespan_years, quality_tier, show_completed, lock_after_minutes)
    select v_user, x.timezone, x.week_start, x.birthdate, x.lifespan_years, x.quality_tier, x.show_completed, x.lock_after_minutes
      from jsonb_populate_record(null::public.sp_settings, p_data -> 'settings') x
    on conflict (user_id) do update set
      timezone = excluded.timezone, week_start = excluded.week_start, birthdate = excluded.birthdate,
      lifespan_years = excluded.lifespan_years, quality_tier = excluded.quality_tier,
      show_completed = excluded.show_completed, lock_after_minutes = excluded.lock_after_minutes;
  end if;

  insert into public.sp_task_lists as t (id, user_id, name, emoji, sort_order, deleted_at, created_at)
  select x.id, v_user, x.name, x.emoji, x.sort_order, x.deleted_at, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_task_lists, coalesce(p_data -> 'task_lists', '[]'::jsonb)) x
  on conflict (id) do update set name = excluded.name, emoji = excluded.emoji,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('task_lists', v_n);

  insert into public.sp_tasks as t (id, user_id, name, description, due_date, due_time, list_id, completed, completed_at, sort_order, deleted_at, created_at)
  select x.id, v_user, x.name, x.description, x.due_date, x.due_time, x.list_id, x.completed, x.completed_at, x.sort_order, x.deleted_at, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_tasks, coalesce(p_data -> 'tasks', '[]'::jsonb)) x
  on conflict (id) do update set name = excluded.name, description = excluded.description,
    due_date = excluded.due_date, due_time = excluded.due_time, list_id = excluded.list_id,
    completed = excluded.completed, completed_at = excluded.completed_at,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('tasks', v_n);

  insert into public.sp_goal_lists as t (id, user_id, name, emoji, sort_order, deleted_at, created_at)
  select x.id, v_user, x.name, x.emoji, x.sort_order, x.deleted_at, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_goal_lists, coalesce(p_data -> 'goal_lists', '[]'::jsonb)) x
  on conflict (id) do update set name = excluded.name, emoji = excluded.emoji,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('goal_lists', v_n);

  insert into public.sp_goals as t (id, user_id, list_id, name, description, type, current_amount, total_amount, unit, completed, sort_order, deleted_at, created_at)
  select x.id, v_user, x.list_id, x.name, x.description, x.type, coalesce(x.current_amount, 0), x.total_amount, x.unit, coalesce(x.completed, false), x.sort_order, x.deleted_at, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_goals, coalesce(p_data -> 'goals', '[]'::jsonb)) x
  on conflict (id) do update set list_id = excluded.list_id, name = excluded.name,
    description = excluded.description, type = excluded.type, current_amount = excluded.current_amount,
    total_amount = excluded.total_amount, unit = excluded.unit, completed = excluded.completed,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('goals', v_n);

  insert into public.sp_routines as t (id, user_id, name, description, emoji, type, total_amount, unit, start_date, end_date, frequency, weekdays, interval_days, sort_order, created_at)
  select x.id, v_user, x.name, x.description, x.emoji, x.type, x.total_amount, x.unit, x.start_date, x.end_date, x.frequency, x.weekdays, x.interval_days, x.sort_order, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_routines, coalesce(p_data -> 'routines', '[]'::jsonb)) x
  on conflict (id) do update set name = excluded.name, description = excluded.description,
    emoji = excluded.emoji, type = excluded.type, total_amount = excluded.total_amount, unit = excluded.unit,
    start_date = excluded.start_date, end_date = excluded.end_date, frequency = excluded.frequency,
    weekdays = excluded.weekdays, interval_days = excluded.interval_days, sort_order = excluded.sort_order
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('routines', v_n);

  insert into public.sp_routine_logs as t (routine_id, date, user_id, completed, amount)
  select x.routine_id, x.date, v_user, coalesce(x.completed, false), coalesce(x.amount, 0)
    from jsonb_populate_recordset(null::public.sp_routine_logs, coalesce(p_data -> 'routine_logs', '[]'::jsonb)) x
    join public.sp_routines r on r.id = x.routine_id and r.user_id = v_user
   where public.sp_routine_scheduled(r, x.date)
  on conflict (routine_id, date) do update set completed = excluded.completed, amount = excluded.amount;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('routine_logs', v_n);

  insert into public.sp_block_lists as t (id, user_id, name, emoji, sort_order, deleted_at, created_at)
  select x.id, v_user, x.name, x.emoji, x.sort_order, x.deleted_at, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_block_lists, coalesce(p_data -> 'block_lists', '[]'::jsonb)) x
  on conflict (id) do update set name = excluded.name, emoji = excluded.emoji,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('block_lists', v_n);

  insert into public.sp_block_list_sites as t (id, user_id, block_list_id, pattern, created_at)
  select x.id, v_user, x.block_list_id, x.pattern, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_block_list_sites, coalesce(p_data -> 'block_list_sites', '[]'::jsonb)) x
    join public.sp_block_lists l on l.id = x.block_list_id and l.user_id = v_user
   where public.sp_normalize_site(x.pattern) is not null
  on conflict do nothing;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('block_list_sites', v_n);

  if jsonb_typeof(p_data -> 'focus_settings') = 'object' then
    insert into public.sp_focus_settings as t (user_id, focus_min, short_break_min, long_break_min, rounds_before_long, auto_start_breaks, auto_start_focus, active_block_list_ids)
    select v_user, x.focus_min, x.short_break_min, x.long_break_min, x.rounds_before_long, x.auto_start_breaks, x.auto_start_focus,
           coalesce(array(select l.id from public.sp_block_lists l where l.user_id = v_user and l.deleted_at is null and l.id = any (x.active_block_list_ids)), '{}')
      from jsonb_populate_record(null::public.sp_focus_settings, p_data -> 'focus_settings') x
    on conflict (user_id) do update set
      focus_min = excluded.focus_min, short_break_min = excluded.short_break_min,
      long_break_min = excluded.long_break_min, rounds_before_long = excluded.rounds_before_long,
      auto_start_breaks = excluded.auto_start_breaks, auto_start_focus = excluded.auto_start_focus,
      active_block_list_ids = excluded.active_block_list_ids;
  end if;

  insert into public.sp_focus_sessions as t (id, user_id, session_id, started_at, ended_at, phase, planned_seconds, actual_seconds, completed, round, created_at)
  select x.id, v_user, x.session_id, x.started_at, x.ended_at, x.phase, x.planned_seconds, x.actual_seconds, coalesce(x.completed, false), coalesce(x.round, 1), coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_focus_sessions, coalesce(p_data -> 'focus_sessions', '[]'::jsonb)) x
  on conflict (id) do nothing;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('focus_sessions', v_n);

  insert into public.sp_quotes as t (id, user_id, text, author, is_builtin, created_at)
  select x.id, v_user, x.text, coalesce(x.author, ''), false, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_quotes, coalesce(p_data -> 'quotes', '[]'::jsonb)) x
  on conflict (id) do update set text = excluded.text, author = excluded.author
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('quotes', v_n);

  insert into public.sp_events as t (id, user_id, name, emoji, date, time, created_at)
  select x.id, v_user, x.name, coalesce(x.emoji, '📅'), x.date, x.time, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_events, coalesce(p_data -> 'events', '[]'::jsonb)) x
   where x.date is not null
  on conflict (id) do update set name = excluded.name, emoji = excluded.emoji,
    date = excluded.date, time = excluded.time
  where t.user_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('events', v_n);

  return jsonb_build_object('ok', true, 'imported', v_counts);
end;
$fn$;
