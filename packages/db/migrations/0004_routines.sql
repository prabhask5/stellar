-- Stellar Planner · 0004 · routines. Day-goals are computed from the schedule;
-- only per-day results (sp_routine_logs) are stored.

create table if not exists public.sp_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  emoji text,
  type text not null default 'todo',
  total_amount numeric,
  unit text,
  start_date date not null,
  end_date date,
  frequency text not null default 'daily',
  weekdays smallint[],
  interval_days int,
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_routines_name_chk check (char_length(btrim(name)) between 1 and 200),
  constraint sp_routines_description_chk check (description is null or char_length(description) <= 5000),
  constraint sp_routines_emoji_chk check (emoji is null or char_length(emoji) between 1 and 32),
  constraint sp_routines_type_chk check (type in ('todo', 'progress')),
  constraint sp_routines_total_chk check (type = 'todo' or (total_amount is not null and total_amount > 0)),
  constraint sp_routines_unit_chk check (unit is null or char_length(unit) <= 40),
  constraint sp_routines_frequency_chk check (frequency in ('daily', 'weekdays', 'interval')),
  constraint sp_routines_weekdays_chk check (
    frequency <> 'weekdays'
    or (weekdays is not null and cardinality(weekdays) >= 1 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  constraint sp_routines_interval_chk check (frequency <> 'interval' or (interval_days is not null and interval_days >= 2)),
  constraint sp_routines_dates_chk check (end_date is null or end_date >= start_date)
);
create index if not exists sp_routines_user_idx on public.sp_routines (user_id, sort_order);
create index if not exists sp_routines_updated_idx on public.sp_routines (user_id, updated_at);

create table if not exists public.sp_routine_logs (
  routine_id uuid not null references public.sp_routines(id) on delete cascade,
  date date not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  completed boolean not null default false,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (routine_id, date),
  constraint sp_routine_logs_amount_chk check (amount >= 0)
);
create index if not exists sp_routine_logs_user_date_idx on public.sp_routine_logs (user_id, date);
create index if not exists sp_routine_logs_updated_idx on public.sp_routine_logs (user_id, updated_at);

-- ── schedule ───────────────────────────────────────────────────────────────
-- Must agree with packages/shared/src/recurrence.ts `isScheduled`.
create or replace function public.sp__scheduled(
  p_start date, p_end date, p_frequency text, p_weekdays smallint[], p_interval int, p_date date
) returns boolean language sql immutable as $fn$
  select p_date >= p_start
     and (p_end is null or p_date <= p_end)
     and case p_frequency
           when 'daily' then true
           when 'weekdays' then coalesce(extract(dow from p_date)::smallint = any (p_weekdays), false)
           when 'interval' then coalesce(p_interval >= 1 and (p_date - p_start) % p_interval = 0, false)
           else false
         end;
$fn$;

create or replace function public.sp_routine_scheduled(r public.sp_routines, d date)
returns boolean language sql immutable as $fn$
  select public.sp__scheduled(r.start_date, r.end_date, r.frequency, r.weekdays, r.interval_days, d);
$fn$;

-- ── triggers ───────────────────────────────────────────────────────────────
create or replace function public.sp_routines_before()
returns trigger language plpgsql as $fn$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.unit := nullif(btrim(coalesce(new.unit, '')), '');
  new.emoji := nullif(btrim(coalesce(new.emoji, '')), '');
  if new.type = 'todo' then
    new.total_amount := null;
    new.unit := null;
  end if;
  if new.frequency <> 'weekdays' then new.weekdays := null; end if;
  if new.frequency <> 'interval' then new.interval_days := null; end if;
  if new.weekdays is not null then
    new.weekdays := array(select distinct w from unnest(new.weekdays) w order by w);
  end if;
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(r.sort_order), 0) + 1024 into new.sort_order
        from public.sp_routines r where r.user_id = new.user_id;
    end if;
  else
    new.user_id := old.user_id;
    if new.sort_order is null then new.sort_order := old.sort_order; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_routines_before on public.sp_routines;
create trigger sp_routines_before before insert or update on public.sp_routines
  for each row execute function public.sp_routines_before();

-- Edit = rewrite everything: logs on days that are no longer scheduled are
-- deleted, and a change of type or total resets what remains.
create or replace function public.sp_routines_after_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_schedule_changed boolean;
  v_measure_changed boolean;
  v_prev text := coalesce(current_setting('sp.skip_scoring', true), '');
begin
  v_schedule_changed := (new.start_date, new.end_date, new.frequency, new.weekdays, new.interval_days)
    is distinct from (old.start_date, old.end_date, old.frequency, old.weekdays, old.interval_days);
  v_measure_changed := new.type is distinct from old.type or new.total_amount is distinct from old.total_amount;
  if not (v_schedule_changed or v_measure_changed) then
    return null;
  end if;

  -- Structural rewrites never touch the stardust ledger.
  perform set_config('sp.skip_scoring', '1', true);
  if v_schedule_changed then
    delete from public.sp_routine_logs l
     where l.routine_id = new.id and not public.sp_routine_scheduled(new, l.date);
  end if;
  if v_measure_changed then
    update public.sp_routine_logs l set completed = false, amount = 0
     where l.routine_id = new.id and (l.completed or l.amount <> 0);
  end if;
  perform set_config('sp.skip_scoring', v_prev, true);
  return null;
end;
$fn$;
drop trigger if exists sp_routines_after_update on public.sp_routines;
create trigger sp_routines_after_update after update on public.sp_routines
  for each row execute function public.sp_routines_after_update();

drop trigger if exists sp_routines_tombstone on public.sp_routines;
create trigger sp_routines_tombstone after delete on public.sp_routines
  for each row execute function public.sp_record_tombstone();

create or replace function public.sp_routine_logs_before()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  r public.sp_routines;
begin
  select * into r from public.sp_routines where id = new.routine_id;
  if not found then
    raise exception 'Routine not found' using errcode = '23503';
  end if;
  new.user_id := r.user_id;
  if tg_op = 'UPDATE' then
    new.routine_id := old.routine_id;
    new.date := old.date;
  end if;
  if not public.sp_routine_scheduled(r, new.date) then
    raise exception 'Routine is not scheduled on %', new.date using errcode = '22023';
  end if;
  if r.type = 'progress' then
    new.amount := greatest(coalesce(new.amount, 0), 0);
    new.completed := new.amount >= r.total_amount;
  else
    new.amount := case when new.completed then 1 else 0 end;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_routine_logs_before on public.sp_routine_logs;
create trigger sp_routine_logs_before before insert or update on public.sp_routine_logs
  for each row execute function public.sp_routine_logs_before();

create or replace function public.sp_routine_logs_tombstone()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.sp_tombstones (user_id, table_name, row_id, row_key)
    values (old.user_id, 'sp_routine_logs', old.routine_id, old.routine_id::text || ':' || old.date::text);
  end if;
  return old;
end;
$fn$;
drop trigger if exists sp_routine_logs_tombstone on public.sp_routine_logs;
create trigger sp_routine_logs_tombstone after delete on public.sp_routine_logs
  for each row execute function public.sp_routine_logs_tombstone();

-- ── row level security ─────────────────────────────────────────────────────
alter table public.sp_routines enable row level security;
drop policy if exists sp_routines_owner on public.sp_routines;
create policy sp_routines_owner on public.sp_routines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.sp_routine_logs enable row level security;
drop policy if exists sp_routine_logs_owner on public.sp_routine_logs;
create policy sp_routine_logs_owner on public.sp_routine_logs
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_routines, public.sp_routine_logs from anon;
grant select, insert, update, delete on public.sp_routines, public.sp_routine_logs to authenticated;
grant all on public.sp_routines, public.sp_routine_logs to service_role;

-- ── day progress, streaks ──────────────────────────────────────────────────
-- Progress 0…1 of one routine on one day.
create or replace function public.sp__instance_progress(r public.sp_routines, p_completed boolean, p_amount numeric)
returns numeric language sql immutable as $fn$
  select case
    when r.type = 'todo' then case when coalesce(p_completed, false) then 1 else 0 end
    when r.total_amount is null or r.total_amount <= 0 then 0
    else least(greatest(coalesce(p_amount, 0) / r.total_amount, 0), 1)
  end::numeric;
$fn$;

-- Mean progress of a user's scheduled instances on a date; null when nothing is scheduled.
create or replace function public.sp__day_fraction(p_user uuid, p_date date)
returns numeric language sql stable security definer set search_path = public, pg_temp as $fn$
  select avg(public.sp__instance_progress(r, l.completed, l.amount))
    from public.sp_routines r
    left join public.sp_routine_logs l on l.routine_id = r.id and l.date = p_date
   where r.user_id = p_user and public.sp_routine_scheduled(r, p_date);
$fn$;

-- Consecutive scheduled days fully completed, ending today or on the most recent
-- scheduled day before today. Must agree with recurrence.ts `computeStreak`.
create or replace function public.sp_routine_streak(r public.sp_routines, p_today date)
returns int language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_streak int := 0;
  v_cursor date := least(p_today, coalesce(r.end_date, p_today));
  v_done boolean;
  v_steps int := 0;
begin
  while v_cursor >= r.start_date and v_steps < 3660 loop
    if public.sp_routine_scheduled(r, v_cursor) then
      select l.completed into v_done from public.sp_routine_logs l
       where l.routine_id = r.id and l.date = v_cursor;
      if coalesce(v_done, false) then
        v_streak := v_streak + 1;
      elsif v_cursor <> p_today then
        exit;
      end if;
      v_done := null;
    end if;
    v_cursor := v_cursor - 1;
    v_steps := v_steps + 1;
  end loop;
  return v_streak;
end;
$fn$;

-- One round trip for a calendar range: per-day instances and completion.
create or replace function public.sp_routine_days(p_from date, p_to date)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Date range too large (max 400 days)' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(day order by (day ->> 'date')), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'date', d::date,
      'fraction', avg(public.sp__instance_progress(r, l.completed, l.amount)),
      'percent', round(avg(public.sp__instance_progress(r, l.completed, l.amount)) * 100),
      'instances', jsonb_agg(jsonb_build_object(
          'routine_id', r.id,
          'name', r.name,
          'emoji', r.emoji,
          'type', r.type,
          'total_amount', r.total_amount,
          'unit', r.unit,
          'completed', coalesce(l.completed, false),
          'amount', coalesce(l.amount, 0),
          'progress', public.sp__instance_progress(r, l.completed, l.amount)
        ) order by r.sort_order, r.created_at)
    ) as day
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    join public.sp_routines r
      on r.user_id = auth.uid() and public.sp_routine_scheduled(r, d::date)
    left join public.sp_routine_logs l on l.routine_id = r.id and l.date = d::date
    group by d
  ) days;
  return v_result;
end;
$fn$;

-- Current streak and "broken" (dim) state for every routine.
create or replace function public.sp_routine_streaks()
returns jsonb language sql stable set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_object_agg(s.id, jsonb_build_object('streak', s.streak, 'broken', s.streak = 0 and s.has_done)), '{}'::jsonb)
  from (
    select r.id,
           public.sp_routine_streak(r, public.sp_today()) as streak,
           exists (select 1 from public.sp_routine_logs l where l.routine_id = r.id and l.completed) as has_done
      from public.sp_routines r
     where r.user_id = auth.uid()
  ) s;
$fn$;

-- Upsert one day's result. For todo routines pass p_completed; for progress pass p_amount.
create or replace function public.sp_routine_log_set(
  p_routine_id uuid, p_date date, p_completed boolean default null, p_amount numeric default null
) returns public.sp_routine_logs language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_log public.sp_routine_logs;
begin
  if not exists (select 1 from public.sp_routines r where r.id = p_routine_id and r.user_id = auth.uid()) then
    raise exception 'Routine not found' using errcode = 'P0002';
  end if;
  insert into public.sp_routine_logs as l (routine_id, date, user_id, completed, amount)
  values (p_routine_id, p_date, auth.uid(), coalesce(p_completed, false), coalesce(p_amount, 0))
  on conflict (routine_id, date) do update
    set completed = coalesce(p_completed, l.completed),
        amount = coalesce(p_amount, l.amount)
  returning l.* into v_log;
  return v_log;
end;
$fn$;

revoke all on function public.sp__scheduled(date, date, text, smallint[], int, date) from public, anon;
revoke all on function public.sp_routine_scheduled(public.sp_routines, date) from public, anon;
revoke all on function public.sp__instance_progress(public.sp_routines, boolean, numeric) from public, anon;
revoke all on function public.sp__day_fraction(uuid, date) from public, anon, authenticated;
revoke all on function public.sp_routine_streak(public.sp_routines, date) from public, anon;
revoke all on function public.sp_routine_days(date, date) from public, anon;
revoke all on function public.sp_routine_streaks() from public, anon;
revoke all on function public.sp_routine_log_set(uuid, date, boolean, numeric) from public, anon;
grant execute on function public.sp__scheduled(date, date, text, smallint[], int, date) to authenticated, service_role;
grant execute on function public.sp_routine_scheduled(public.sp_routines, date) to authenticated, service_role;
grant execute on function public.sp__instance_progress(public.sp_routines, boolean, numeric) to authenticated, service_role;
grant execute on function public.sp__day_fraction(uuid, date) to service_role;
grant execute on function public.sp_routine_streak(public.sp_routines, date) to authenticated, service_role;
grant execute on function public.sp_routine_days(date, date) to authenticated, service_role;
grant execute on function public.sp_routine_streaks() to authenticated, service_role;
grant execute on function public.sp_routine_log_set(uuid, date, boolean, numeric) to authenticated, service_role;
