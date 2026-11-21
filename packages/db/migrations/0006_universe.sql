-- Stellar Planner · 0006 · universe: append-only stardust ledger, scoring triggers, snapshot.
-- Reversals (un-completing something) append negative points so the ledger stays honest.
-- Structural changes (deleting rows, rewriting a routine) never touch the ledger.

create table if not exists public.sp_universe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  ref_id uuid,
  ref_date date,
  points int not null,
  -- Wall-clock time, so events within one transaction keep their order.
  created_at timestamptz not null default clock_timestamp(),
  constraint sp_universe_events_kind_chk check (kind in (
    'task_completed', 'task_uncompleted',
    'routine_instance', 'routine_instance_reversed',
    'routine_day', 'routine_day_reversed',
    'focus_phase',
    'goal_progress', 'goal_completed', 'goal_uncompleted',
    'goal_list_completed', 'goal_list_reversed'))
);
create index if not exists sp_universe_events_user_idx on public.sp_universe_events (user_id, created_at);
create index if not exists sp_universe_events_ref_idx on public.sp_universe_events (user_id, kind, ref_id);
create index if not exists sp_universe_events_date_idx on public.sp_universe_events (user_id, ref_date) where ref_date is not null;
alter table public.sp_universe_events enable row level security;
drop policy if exists sp_universe_events_owner on public.sp_universe_events;
create policy sp_universe_events_owner on public.sp_universe_events
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sp_universe_events from anon, authenticated;
grant select on public.sp_universe_events to authenticated;
grant all on public.sp_universe_events to service_role;

create or replace function public.sp__award(p_user uuid, p_kind text, p_ref uuid, p_date date, p_points int)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if coalesce(current_setting('sp.skip_scoring', true), '') = '1' then return; end if;
  if p_points = 0 then return; end if;
  insert into public.sp_universe_events (user_id, kind, ref_id, ref_date, points)
  values (p_user, p_kind, p_ref, p_date, p_points);
end;
$fn$;

-- ── tasks: 10 per completion ───────────────────────────────────────────────
create or replace function public.sp_tasks_score()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'INSERT' then
    if new.completed then
      perform public.sp__award(new.user_id, 'task_completed', new.id, null, 10);
    end if;
  elsif new.completed and not old.completed then
    perform public.sp__award(new.user_id, 'task_completed', new.id, null, 10);
  elsif old.completed and not new.completed then
    perform public.sp__award(new.user_id, 'task_uncompleted', new.id, null, -10);
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_tasks_score on public.sp_tasks;
create trigger sp_tasks_score after insert or update of completed on public.sp_tasks
  for each row execute function public.sp_tasks_score();

-- ── goals: 50 × Δfraction, 100 per completion, 250 per fully complete list ─
create or replace function public.sp__goal_list_sync(p_user uuid, p_list uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_complete boolean;
  v_awarded boolean;
begin
  if coalesce(current_setting('sp.skip_scoring', true), '') = '1' then return; end if;
  -- A deleted list keeps whatever it earned.
  if not exists (select 1 from public.sp_goal_lists l where l.id = p_list and l.deleted_at is null) then
    return;
  end if;
  select count(*) > 0 and bool_and(g.completed) into v_complete
    from public.sp_goals g where g.list_id = p_list and g.deleted_at is null;
  select coalesce(sum(e.points), 0) > 0 into v_awarded
    from public.sp_universe_events e
   where e.user_id = p_user and e.ref_id = p_list
     and e.kind in ('goal_list_completed', 'goal_list_reversed');
  if coalesce(v_complete, false) and not v_awarded then
    perform public.sp__award(p_user, 'goal_list_completed', p_list, null, 250);
  elsif not coalesce(v_complete, false) and v_awarded then
    perform public.sp__award(p_user, 'goal_list_reversed', p_list, null, -250);
  end if;
end;
$fn$;

create or replace function public.sp_goals_score()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_old numeric := 0;
  v_new numeric := 0;
  v_was boolean := false;
begin
  if tg_op = 'DELETE' then
    perform public.sp__goal_list_sync(old.user_id, old.list_id);
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_was := old.completed;
    if old.type = 'progress' then v_old := public.sp_goal_progress(old); end if;
  end if;
  if new.type = 'progress' then v_new := public.sp_goal_progress(new); end if;

  -- Rounded cumulative values, so many small steps total the same as one big one.
  if new.type = 'progress' or (tg_op = 'UPDATE' and old.type = 'progress') then
    perform public.sp__award(new.user_id, 'goal_progress', new.id, null,
      (round(50 * v_new) - round(50 * v_old))::int);
  end if;

  if new.completed and not v_was then
    perform public.sp__award(new.user_id, 'goal_completed', new.id, null, 100);
  elsif v_was and not new.completed then
    perform public.sp__award(new.user_id, 'goal_uncompleted', new.id, null, -100);
  end if;

  perform public.sp__goal_list_sync(new.user_id, new.list_id);
  if tg_op = 'UPDATE' and old.list_id is distinct from new.list_id then
    perform public.sp__goal_list_sync(new.user_id, old.list_id);
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_goals_score on public.sp_goals;
create trigger sp_goals_score after insert or update or delete on public.sp_goals
  for each row execute function public.sp_goals_score();

-- ── routines: 5 per instance, +20 when the day reaches 100% ────────────────
create or replace function public.sp__routine_day_sync(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_complete boolean;
  v_awarded boolean;
begin
  if coalesce(current_setting('sp.skip_scoring', true), '') = '1' then return; end if;
  v_complete := coalesce(public.sp__day_fraction(p_user, p_date) >= 1, false);
  select coalesce(sum(e.points), 0) > 0 into v_awarded
    from public.sp_universe_events e
   where e.user_id = p_user and e.ref_date = p_date
     and e.kind in ('routine_day', 'routine_day_reversed');
  if v_complete and not v_awarded then
    perform public.sp__award(p_user, 'routine_day', null, p_date, 20);
  elsif not v_complete and v_awarded then
    perform public.sp__award(p_user, 'routine_day_reversed', null, p_date, -20);
  end if;
end;
$fn$;

create or replace function public.sp_routine_logs_score()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_was boolean := false;
begin
  if tg_op = 'UPDATE' then v_was := old.completed; end if;
  if new.completed and not v_was then
    perform public.sp__award(new.user_id, 'routine_instance', new.routine_id, new.date, 5);
  elsif v_was and not new.completed then
    perform public.sp__award(new.user_id, 'routine_instance_reversed', new.routine_id, new.date, -5);
  end if;
  perform public.sp__routine_day_sync(new.user_id, new.date);
  return null;
end;
$fn$;
drop trigger if exists sp_routine_logs_score on public.sp_routine_logs;
create trigger sp_routine_logs_score after insert or update on public.sp_routine_logs
  for each row execute function public.sp_routine_logs_score();

-- ── focus: 25 per 25 focus minutes, pro-rated ──────────────────────────────
create or replace function public.sp_focus_sessions_score()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.completed and new.phase = 'focus' then
    perform public.sp__award(new.user_id, 'focus_phase', new.id, null,
      round(25 * new.actual_seconds / 1500.0)::int);
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_focus_sessions_score on public.sp_focus_sessions;
create trigger sp_focus_sessions_score after insert on public.sp_focus_sessions
  for each row execute function public.sp_focus_sessions_score();

-- ── eras ───────────────────────────────────────────────────────────────────
create or replace function public.sp_eras()
returns table (idx int, name text, threshold int) language sql immutable as $fn$
  values (0, 'Void', 0), (1, 'First Light', 100), (2, 'Nebula', 1000), (3, 'Star Cluster', 5000),
         (4, 'Galaxy', 15000), (5, 'Supercluster', 40000), (6, 'Cosmic Web', 100000);
$fn$;

create or replace function public.sp_era_index(p_total bigint)
returns int language sql immutable as $fn$
  select max(e.idx) from public.sp_eras() e where e.threshold <= greatest(p_total, 0);
$fn$;

create or replace function public.sp__era_json(p_total bigint)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'index', cur.idx, 'name', cur.name, 'threshold', cur.threshold,
    'next_name', nxt.name, 'next_threshold', nxt.threshold,
    'remaining', case when nxt.idx is null then 0 else greatest(nxt.threshold - greatest(p_total, 0), 0) end,
    'fraction', case when nxt.idx is null then 1
                     else least(1, (greatest(p_total, 0) - cur.threshold)::numeric / (nxt.threshold - cur.threshold)) end)
  from public.sp_eras() cur
  left join public.sp_eras() nxt on nxt.idx = cur.idx + 1
  where cur.idx = public.sp_era_index(p_total);
$fn$;

-- ── snapshot ───────────────────────────────────────────────────────────────
-- Small by construction: old stars are aggregated per month, only the most
-- recent ones are sent individually.
create or replace function public.sp_universe_snapshot()
returns jsonb language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_tz text := public.sp__timezone(auth.uid());
  v_today date := public.sp_today();
  v_total bigint;
  v_star_count bigint;
  v_recent jsonb;
  v_months jsonb;
  v_lists jsonb;
  v_planets jsonb;
  v_constellations jsonb;
  v_focus_seconds bigint;
  v_focus_phases bigint;
begin
  select coalesce(sum(e.points), 0),
         coalesce(sum(case e.kind when 'task_completed' then 1 when 'task_uncompleted' then -1 else 0 end), 0)
    into v_total, v_star_count
    from public.sp_universe_events e where e.user_id = v_user;
  v_total := greatest(v_total, 0);
  v_star_count := greatest(v_star_count, 0);

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'at', x.completed_at) order by x.completed_at desc), '[]'::jsonb)
    into v_recent
    from (
      select t.id, t.completed_at from public.sp_tasks t
       where t.user_id = v_user and t.completed
       order by t.completed_at desc nulls last
       limit 240
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'count', m.n) order by m.month), '[]'::jsonb)
    into v_months
    from (
      select to_char(e.created_at at time zone v_tz, 'YYYY-MM') as month,
             sum(case e.kind when 'task_completed' then 1 else -1 end) as n
        from public.sp_universe_events e
       where e.user_id = v_user and e.kind in ('task_completed', 'task_uncompleted')
       group by 1
      having sum(case e.kind when 'task_completed' then 1 else -1 end) > 0
    ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name, 'emoji', l.emoji,
           'total', s.total, 'complete', s.complete, 'fraction', s.fraction,
           'all_complete', s.total > 0 and s.complete = s.total) order by l.sort_order), '[]'::jsonb)
    into v_lists
    from public.sp_goal_lists l
    join public.sp_goal_list_progress() s on s.list_id = l.id
   where l.user_id = v_user and l.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'list_id', g.list_id, 'name', g.name, 'type', g.type,
           'progress', public.sp_goal_progress(g), 'completed', g.completed) order by g.sort_order), '[]'::jsonb)
    into v_planets
    from public.sp_goals g
    join public.sp_goal_lists l on l.id = g.list_id and l.deleted_at is null
   where g.user_id = v_user and g.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'emoji', c.emoji,
           'streak', c.streak, 'stars', c.stars,
           'broken', c.streak = 0 and c.stars > 0) order by c.sort_order), '[]'::jsonb)
    into v_constellations
    from (
      select r.id, r.name, r.emoji, r.sort_order,
             public.sp_routine_streak(r, v_today) as streak,
             (select count(*) from public.sp_routine_logs l where l.routine_id = r.id and l.completed) as stars
        from public.sp_routines r where r.user_id = v_user
    ) c;

  select coalesce(sum(s.actual_seconds) filter (where s.phase = 'focus'), 0),
         count(*) filter (where s.phase = 'focus' and s.completed)
    into v_focus_seconds, v_focus_phases
    from public.sp_focus_sessions s where s.user_id = v_user;

  return jsonb_build_object(
    'total', v_total,
    'era', public.sp__era_json(v_total),
    'stars', jsonb_build_object('count', v_star_count, 'recent', v_recent, 'months', v_months),
    'lists', v_lists,
    'planets', v_planets,
    'constellations', v_constellations,
    'focus', jsonb_build_object('minutes', round(v_focus_seconds / 60.0), 'phases', v_focus_phases),
    'server_time', clock_timestamp());
end;
$fn$;

revoke all on function public.sp__award(uuid, text, uuid, date, int) from public, anon, authenticated;
revoke all on function public.sp__goal_list_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sp__routine_day_sync(uuid, date) from public, anon, authenticated;
revoke all on function public.sp_eras() from public, anon;
revoke all on function public.sp_era_index(bigint) from public, anon;
revoke all on function public.sp__era_json(bigint) from public, anon;
revoke all on function public.sp_universe_snapshot() from public, anon;
grant execute on function public.sp__award(uuid, text, uuid, date, int) to service_role;
grant execute on function public.sp__goal_list_sync(uuid, uuid) to service_role;
grant execute on function public.sp__routine_day_sync(uuid, date) to service_role;
grant execute on function public.sp_eras() to authenticated, service_role;
grant execute on function public.sp_era_index(bigint) to authenticated, service_role;
grant execute on function public.sp__era_json(bigint) to authenticated, service_role;
grant execute on function public.sp_universe_snapshot() to authenticated, service_role;
