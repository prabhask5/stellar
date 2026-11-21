-- Stellar Planner · 0007 · realtime publication, bootstrap, rebalance, purge, export/import.

-- ── realtime ───────────────────────────────────────────────────────────────
do $do$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'sp_focus_state', 'sp_focus_settings', 'sp_block_lists', 'sp_block_list_sites',
    'sp_tasks', 'sp_task_lists', 'sp_goals', 'sp_goal_lists', 'sp_routines', 'sp_routine_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    -- Full row images so UPDATE/DELETE events carry user_id for filtering.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end;
$do$;

-- ── bootstrap ──────────────────────────────────────────────────────────────
-- Ensures the per-user singleton rows exist and returns them. Safe to call on every launch.
create or replace function public.sp_bootstrap(p_timezone text default null, p_week_start smallint default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_tz text := p_timezone;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.sp_settings (user_id, timezone, week_start)
  values (v_user, v_tz, coalesce(p_week_start, 1))
  on conflict (user_id) do nothing;
  perform public.sp__focus_ensure(v_user);

  select jsonb_build_object(
      'user_id', v_user,
      'settings', to_jsonb(s),
      'focus_settings', to_jsonb(fs),
      'focus_state', to_jsonb(st),
      'today', public.sp__today(v_user),
      'schema_version', (select max(version) from public.sp_schema_version),
      'server_time', clock_timestamp())
    into v_result
    from public.sp_settings s
    join public.sp_focus_settings fs on fs.user_id = s.user_id
    join public.sp_focus_state st on st.user_id = s.user_id
   where s.user_id = v_user;
  return v_result;
end;
$fn$;

-- ── rebalance ──────────────────────────────────────────────────────────────
-- Respaces sort_order when neighbours have become too close to split again.
create or replace function public.sp_rebalance(p_table text, p_scope uuid default null)
returns int language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_count int;
begin
  if p_table in ('sp_task_lists', 'sp_goal_lists', 'sp_routines', 'sp_block_lists') then
    execute format($q$
      with ranked as (
        select id, row_number() over (order by sort_order, created_at, id) * 1024.0 as rank
          from public.%1$I where user_id = auth.uid())
      update public.%1$I t set sort_order = r.rank from ranked r
       where t.id = r.id and t.sort_order is distinct from r.rank
    $q$, p_table);
  elsif p_table in ('sp_tasks', 'sp_goals') then
    execute format($q$
      with ranked as (
        select id, row_number() over (order by sort_order, created_at, id) * 1024.0 as rank
          from public.%1$I where user_id = auth.uid() and list_id is not distinct from $1)
      update public.%1$I t set sort_order = r.rank from ranked r
       where t.id = r.id and t.sort_order is distinct from r.rank
    $q$, p_table) using p_scope;
  else
    raise exception 'Table cannot be rebalanced: %', p_table using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ── purge ──────────────────────────────────────────────────────────────────
-- Soft-deleted content is removed for good after 30 days. Run daily by the app server.
create or replace function public.sp_purge_deleted(p_older_than interval default interval '30 days')
returns int language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_total int := 0;
  v_n int;
begin
  delete from public.sp_tasks where deleted_at < v_cutoff;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.sp_task_lists where deleted_at < v_cutoff;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.sp_goals where deleted_at < v_cutoff;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.sp_goal_lists where deleted_at < v_cutoff;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.sp_block_lists where deleted_at < v_cutoff;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.sp_tombstones where deleted_at < now() - interval '180 days';
  delete from public.sp_auth_events where created_at < now() - interval '365 days';
  return v_total;
end;
$fn$;

-- ── export / import ────────────────────────────────────────────────────────
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
    'universe_events', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb) from public.sp_universe_events x where x.user_id = v_user)
  );
end;
$fn$;

-- Merges an export into the caller's account. Rows are matched by id, so
-- importing the same file twice changes nothing. Scoring triggers are paused
-- and the ledger is restored from the file instead, so nothing is counted twice.
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

  perform set_config('sp.skip_scoring', '1', true);

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

  insert into public.sp_universe_events as t (id, user_id, kind, ref_id, ref_date, points, created_at)
  select x.id, v_user, x.kind, x.ref_id, x.ref_date, x.points, coalesce(x.created_at, now())
    from jsonb_populate_recordset(null::public.sp_universe_events, coalesce(p_data -> 'universe_events', '[]'::jsonb)) x
  on conflict (id) do nothing;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('universe_events', v_n);

  perform set_config('sp.skip_scoring', '', true);
  return jsonb_build_object('ok', true, 'imported', v_counts);
end;
$fn$;

revoke all on function public.sp_bootstrap(text, smallint) from public, anon;
revoke all on function public.sp_rebalance(text, uuid) from public, anon;
revoke all on function public.sp_purge_deleted(interval) from public, anon, authenticated;
revoke all on function public.sp_export() from public, anon;
revoke all on function public.sp_import(jsonb) from public, anon;
grant execute on function public.sp_bootstrap(text, smallint) to authenticated, service_role;
grant execute on function public.sp_rebalance(text, uuid) to authenticated, service_role;
grant execute on function public.sp_purge_deleted(interval) to service_role;
grant execute on function public.sp_export() to authenticated, service_role;
grant execute on function public.sp_import(jsonb) to authenticated, service_role;
