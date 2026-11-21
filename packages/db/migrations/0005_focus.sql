-- Stellar Planner · 0005 · focus timer (server-authoritative, versioned) and block lists.

create table if not exists public.sp_focus_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  focus_min int not null default 25,
  short_break_min int not null default 5,
  long_break_min int not null default 15,
  rounds_before_long int not null default 4,
  auto_start_breaks boolean not null default false,
  auto_start_focus boolean not null default false,
  active_block_list_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_focus_settings_focus_chk check (focus_min between 1 and 600),
  constraint sp_focus_settings_short_chk check (short_break_min between 1 and 600),
  constraint sp_focus_settings_long_chk check (long_break_min between 1 and 600),
  constraint sp_focus_settings_rounds_chk check (rounds_before_long between 1 and 12)
);
drop trigger if exists sp_focus_settings_updated on public.sp_focus_settings;
create trigger sp_focus_settings_updated before update on public.sp_focus_settings
  for each row execute function public.sp_set_updated_at();

create table if not exists public.sp_focus_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'idle',
  phase text not null default 'focus',
  round int not null default 1,
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  paused_remaining_ms int,
  phase_total_ms int,
  session_id uuid,
  version bigint not null default 0,
  last_completed_phase text,
  last_completed_at timestamptz,
  notified_phase_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'awaiting' = a phase ended and auto-start is off; waiting for Start.
  constraint sp_focus_state_status_chk check (status in ('idle', 'running', 'paused', 'awaiting')),
  constraint sp_focus_state_phase_chk check (phase in ('focus', 'short_break', 'long_break')),
  constraint sp_focus_state_round_chk check (round >= 1),
  constraint sp_focus_state_running_chk check (status <> 'running' or phase_ends_at is not null),
  constraint sp_focus_state_paused_chk check (status <> 'paused' or paused_remaining_ms is not null)
);
create index if not exists sp_focus_state_due_idx on public.sp_focus_state (phase_ends_at) where status = 'running';
drop trigger if exists sp_focus_state_updated on public.sp_focus_state;
create trigger sp_focus_state_updated before update on public.sp_focus_state
  for each row execute function public.sp_set_updated_at();

-- One row per finished or abandoned phase.
create table if not exists public.sp_focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  phase text not null,
  planned_seconds int not null,
  actual_seconds int not null,
  completed boolean not null default false,
  round int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_focus_sessions_phase_chk check (phase in ('focus', 'short_break', 'long_break')),
  constraint sp_focus_sessions_seconds_chk check (planned_seconds >= 0 and actual_seconds >= 0)
);
create index if not exists sp_focus_sessions_user_idx on public.sp_focus_sessions (user_id, ended_at desc);

create table if not exists public.sp_block_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_block_lists_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint sp_block_lists_emoji_chk check (emoji is null or char_length(emoji) between 1 and 32)
);
create index if not exists sp_block_lists_user_idx on public.sp_block_lists (user_id, sort_order) where deleted_at is null;

create table if not exists public.sp_block_list_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  block_list_id uuid not null references public.sp_block_lists(id) on delete cascade,
  pattern text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_block_list_sites_uniq unique (block_list_id, pattern)
);
create index if not exists sp_block_list_sites_user_idx on public.sp_block_list_sites (user_id);

-- ── site pattern normalisation (mirrors normalize.ts `normalizeSitePattern`) ─
create or replace function public.sp_normalize_site(p_input text)
returns text language plpgsql immutable as $fn$
declare
  s text := lower(btrim(coalesce(p_input, ''), E' \t\n\r'));
  v_tld text;
begin
  if s = '' then return null; end if;
  s := regexp_replace(s, '^[a-z][a-z0-9+.-]*://', '');
  s := regexp_replace(s, '^[^/?#]*@', '');
  s := regexp_replace(s, '[/?#].*$', '');
  s := regexp_replace(s, ':[0-9]+$', '');
  s := regexp_replace(s, '^\*\.', '');
  s := regexp_replace(s, '^www\.', '');
  s := regexp_replace(s, '\.$', '');
  if s = '' or s ~ '\s' or char_length(s) > 253 then return null; end if;
  if s !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return null;
  end if;
  v_tld := substring(s from '[^.]+$');
  if v_tld ~ '^[0-9]+$' then return null; end if;
  return s;
end;
$fn$;

create or replace function public.sp_block_lists_before()
returns trigger language plpgsql as $fn$
begin
  new.name := btrim(new.name);
  new.emoji := nullif(btrim(coalesce(new.emoji, '')), '');
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(l.sort_order), 0) + 1024 into new.sort_order
        from public.sp_block_lists l where l.user_id = new.user_id;
    end if;
  else
    new.user_id := old.user_id;
    if new.sort_order is null then new.sort_order := old.sort_order; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_block_lists_before on public.sp_block_lists;
create trigger sp_block_lists_before before insert or update on public.sp_block_lists
  for each row execute function public.sp_block_lists_before();

-- A deleted list can no longer be active.
create or replace function public.sp_block_lists_after_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'DELETE' or (old.deleted_at is null and new.deleted_at is not null) then
    update public.sp_focus_settings s
       set active_block_list_ids = array_remove(s.active_block_list_ids, old.id)
     where s.user_id = old.user_id and old.id = any (s.active_block_list_ids);
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_block_lists_after_change on public.sp_block_lists;
create trigger sp_block_lists_after_change after update of deleted_at or delete on public.sp_block_lists
  for each row execute function public.sp_block_lists_after_change();

create or replace function public.sp_block_list_sites_before()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_owner uuid;
  v_pattern text := public.sp_normalize_site(new.pattern);
begin
  if v_pattern is null then
    raise exception 'Invalid website: %', new.pattern using errcode = '22023';
  end if;
  select l.user_id into v_owner from public.sp_block_lists l where l.id = new.block_list_id;
  if v_owner is null then
    raise exception 'Block list not found' using errcode = '23503';
  end if;
  new.user_id := v_owner;
  new.pattern := v_pattern;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_block_list_sites_before on public.sp_block_list_sites;
create trigger sp_block_list_sites_before before insert or update on public.sp_block_list_sites
  for each row execute function public.sp_block_list_sites_before();
drop trigger if exists sp_block_list_sites_tombstone on public.sp_block_list_sites;
create trigger sp_block_list_sites_tombstone after delete on public.sp_block_list_sites
  for each row execute function public.sp_record_tombstone();

-- ── row level security ─────────────────────────────────────────────────────
alter table public.sp_focus_settings enable row level security;
drop policy if exists sp_focus_settings_owner on public.sp_focus_settings;
create policy sp_focus_settings_owner on public.sp_focus_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- State and sessions are written only by the timer RPC.
alter table public.sp_focus_state enable row level security;
drop policy if exists sp_focus_state_owner on public.sp_focus_state;
create policy sp_focus_state_owner on public.sp_focus_state
  for select to authenticated using (user_id = (select auth.uid()));
alter table public.sp_focus_sessions enable row level security;
drop policy if exists sp_focus_sessions_owner on public.sp_focus_sessions;
create policy sp_focus_sessions_owner on public.sp_focus_sessions
  for select to authenticated using (user_id = (select auth.uid()));
alter table public.sp_block_lists enable row level security;
drop policy if exists sp_block_lists_owner on public.sp_block_lists;
create policy sp_block_lists_owner on public.sp_block_lists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.sp_block_list_sites enable row level security;
drop policy if exists sp_block_list_sites_owner on public.sp_block_list_sites;
create policy sp_block_list_sites_owner on public.sp_block_list_sites
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.sp_focus_settings, public.sp_focus_state, public.sp_focus_sessions,
  public.sp_block_lists, public.sp_block_list_sites from anon;
revoke all on public.sp_focus_state, public.sp_focus_sessions from authenticated;
grant select, insert, update on public.sp_focus_settings to authenticated;
grant select on public.sp_focus_state, public.sp_focus_sessions to authenticated;
grant select, insert, update, delete on public.sp_block_lists, public.sp_block_list_sites to authenticated;
grant all on public.sp_focus_settings, public.sp_focus_state, public.sp_focus_sessions,
  public.sp_block_lists, public.sp_block_list_sites to service_role;

-- ── timer state machine (mirrors packages/shared/src/timer.ts) ─────────────
create or replace function public.sp__focus_ensure(p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into public.sp_focus_settings (user_id) values (p_user) on conflict (user_id) do nothing;
  insert into public.sp_focus_state (user_id) values (p_user) on conflict (user_id) do nothing;
end;
$fn$;

create or replace function public.sp__phase_ms(cfg public.sp_focus_settings, p_phase text)
returns int language sql immutable as $fn$
  select (case p_phase
            when 'focus' then cfg.focus_min
            when 'short_break' then cfg.short_break_min
            else cfg.long_break_min
          end) * 60000;
$fn$;

create or replace function public.sp__ms_between(p_from timestamptz, p_to timestamptz)
returns bigint language sql immutable as $fn$
  select round(extract(epoch from (p_to - p_from)) * 1000)::bigint;
$fn$;

create or replace function public.sp__timer_apply(
  p_user uuid, p_action text, p_expected_version bigint, p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  s public.sp_focus_state;
  cfg public.sp_focus_settings;
  v_error text;
  v_begin boolean := false;      -- start a phase running at v_start
  v_await boolean := false;      -- park at the boundary, waiting for Start
  v_start timestamptz := p_now;
  v_write_session boolean := false;
  v_completed boolean := false;
  v_sess_started timestamptz;
  v_sess_ended timestamptz;
  v_total bigint;
  v_remaining bigint;
  v_elapsed bigint;
  v_sess_phase text;
  v_sess_round int;
  v_next_phase text;
  v_next_round int;
  v_session jsonb;
begin
  perform public.sp__focus_ensure(p_user);
  select * into s from public.sp_focus_state where user_id = p_user for update;
  select * into cfg from public.sp_focus_settings where user_id = p_user;

  if p_expected_version is distinct from s.version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict', 'state', to_jsonb(s), 'session', null);
  end if;

  -- What follows the current phase. After a long break the cycle restarts at round 1.
  if s.phase = 'focus' then
    v_next_phase := case when s.round % greatest(cfg.rounds_before_long, 1) = 0 then 'long_break' else 'short_break' end;
    v_next_round := s.round;
  elsif s.phase = 'long_break' then
    v_next_phase := 'focus';
    v_next_round := 1;
  else
    v_next_phase := 'focus';
    v_next_round := s.round + 1;
  end if;

  -- The record for the phase in flight, if any (used by skip and end).
  v_total := coalesce(s.phase_total_ms, 0);
  v_sess_phase := s.phase;
  v_sess_round := s.round;
  if s.status = 'running' then
    v_remaining := greatest(0, public.sp__ms_between(p_now, coalesce(s.phase_ends_at, p_now)));
  elsif s.status = 'paused' then
    v_remaining := greatest(0, coalesce(s.paused_remaining_ms, 0));
  end if;
  v_elapsed := least(v_total, greatest(0, v_total - coalesce(v_remaining, 0)));

  if p_action = 'start' then
    if s.status = 'idle' then
      s.session_id := gen_random_uuid();
      s.phase := 'focus';
      s.round := 1;
      v_begin := true;
    elsif s.status = 'awaiting' then
      v_begin := true;
    else
      v_error := 'invalid_transition';
    end if;

  elsif p_action = 'pause' then
    if s.status = 'running' and s.phase_ends_at is not null then
      s.status := 'paused';
      s.paused_remaining_ms := greatest(0, public.sp__ms_between(p_now, s.phase_ends_at))::int;
      s.phase_ends_at := null;
    else
      v_error := 'invalid_transition';
    end if;

  elsif p_action = 'resume' then
    if s.status = 'paused' and s.paused_remaining_ms is not null then
      s.status := 'running';
      s.phase_ends_at := p_now + make_interval(secs => s.paused_remaining_ms / 1000.0);
      s.paused_remaining_ms := null;
    else
      v_error := 'invalid_transition';
    end if;

  elsif p_action = 'skip' then
    if s.status = 'idle' then
      v_error := 'invalid_transition';
    else
      if s.status in ('running', 'paused') then
        v_write_session := true;
        v_sess_started := coalesce(s.phase_started_at, p_now);
        v_sess_ended := p_now;
      end if;
      s.phase := v_next_phase;
      s.round := v_next_round;
      if (v_next_phase = 'focus' and cfg.auto_start_focus) or (v_next_phase <> 'focus' and cfg.auto_start_breaks) then
        v_begin := true;
      else
        v_await := true;
      end if;
    end if;

  elsif p_action = 'end' then
    if s.status = 'idle' then
      v_error := 'invalid_transition';
    else
      if s.status in ('running', 'paused') then
        v_write_session := true;
        v_sess_started := coalesce(s.phase_started_at, p_now);
        v_sess_ended := p_now;
      end if;
      s.status := 'idle';
      s.phase := 'focus';
      s.round := 1;
      s.phase_started_at := null;
      s.phase_ends_at := null;
      s.paused_remaining_ms := null;
      s.phase_total_ms := null;
      s.session_id := null;
    end if;

  elsif p_action = 'advance' then
    if s.status <> 'running' or s.phase_ends_at is null then
      v_error := 'invalid_transition';
    elsif p_now < s.phase_ends_at then
      v_error := 'not_due';
    else
      v_write_session := true;
      v_completed := true;
      v_sess_ended := s.phase_ends_at;
      v_sess_started := coalesce(s.phase_started_at, s.phase_ends_at - make_interval(secs => v_total / 1000.0));
      v_elapsed := v_total;
      s.last_completed_phase := s.phase;
      s.last_completed_at := s.phase_ends_at;
      -- A slightly late advancer starts the next phase exactly at the boundary.
      v_start := case when p_now - s.phase_ends_at <= interval '10 seconds' then s.phase_ends_at else p_now end;
      s.phase := v_next_phase;
      s.round := v_next_round;
      if (v_next_phase = 'focus' and cfg.auto_start_focus) or (v_next_phase <> 'focus' and cfg.auto_start_breaks) then
        v_begin := true;
      else
        v_await := true;
      end if;
    end if;

  else
    v_error := 'invalid_transition';
  end if;

  if v_error is not null then
    select * into s from public.sp_focus_state where user_id = p_user;
    return jsonb_build_object('ok', false, 'error', v_error, 'state', to_jsonb(s), 'session', null);
  end if;

  if v_begin then
    s.status := 'running';
    s.phase_total_ms := public.sp__phase_ms(cfg, s.phase);
    s.phase_started_at := v_start;
    s.phase_ends_at := v_start + make_interval(secs => s.phase_total_ms / 1000.0);
    s.paused_remaining_ms := null;
  elsif v_await then
    s.status := 'awaiting';
    s.phase_started_at := null;
    s.phase_ends_at := null;
    s.paused_remaining_ms := null;
    s.phase_total_ms := null;
  end if;

  s.version := s.version + 1;

  update public.sp_focus_state t set
    status = s.status, phase = s.phase, round = s.round,
    phase_started_at = s.phase_started_at, phase_ends_at = s.phase_ends_at,
    paused_remaining_ms = s.paused_remaining_ms, phase_total_ms = s.phase_total_ms,
    session_id = s.session_id, version = s.version,
    last_completed_phase = s.last_completed_phase, last_completed_at = s.last_completed_at
  where t.user_id = p_user
  returning t.* into s;

  if v_write_session then
    insert into public.sp_focus_sessions
      (user_id, session_id, started_at, ended_at, phase, planned_seconds, actual_seconds, completed, round)
    values
      (p_user, s.session_id, v_sess_started, v_sess_ended, v_sess_phase,
       round(v_total / 1000.0)::int, round(v_elapsed / 1000.0)::int, v_completed, v_sess_round)
    returning jsonb_build_object(
      'started_at', started_at, 'ended_at', ended_at, 'phase', phase,
      'planned_seconds', planned_seconds, 'actual_seconds', actual_seconds,
      'completed', completed, 'round', round) into v_session;
  end if;

  return jsonb_build_object('ok', true, 'error', null, 'state', to_jsonb(s), 'session', v_session);
end;
$fn$;

-- Public RPC. actions: start | pause | resume | skip | end | advance.
-- Rejects stale writes via expected_version and always returns the server time
-- so clients can correct for clock skew.
create or replace function public.sp_timer_action(p_action text, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_action not in ('start', 'pause', 'resume', 'skip', 'end', 'advance') then
    raise exception 'Unknown action: %', p_action using errcode = '22023';
  end if;
  return public.sp__timer_apply(v_user, p_action, p_expected_version, clock_timestamp())
         || jsonb_build_object('server_time', clock_timestamp());
end;
$fn$;

-- Blocking is active iff a focus phase is running or paused.
create or replace function public.sp__blocking(p_user uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'active', coalesce(st.phase = 'focus' and st.status in ('running', 'paused'), false),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'emoji', l.emoji) order by l.sort_order)
        from public.sp_block_lists l
       where l.user_id = p_user and l.deleted_at is null and l.id = any (cfg.active_block_list_ids)), '[]'::jsonb),
    'patterns', coalesce((
      select jsonb_agg(distinct s.pattern)
        from public.sp_block_list_sites s
        join public.sp_block_lists l on l.id = s.block_list_id
       where l.user_id = p_user and l.deleted_at is null and l.id = any (cfg.active_block_list_ids)), '[]'::jsonb))
  from (select p_user as user_id) u
  left join public.sp_focus_state st on st.user_id = u.user_id
  left join public.sp_focus_settings cfg on cfg.user_id = u.user_id;
$fn$;

create or replace function public.sp_focus_get()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.sp__focus_ensure(v_user);
  select jsonb_build_object(
    'state', to_jsonb(st), 'settings', to_jsonb(cfg),
    'blocking', public.sp__blocking(v_user), 'server_time', clock_timestamp())
    into v_result
    from public.sp_focus_state st join public.sp_focus_settings cfg using (user_id)
   where st.user_id = v_user;
  return v_result;
end;
$fn$;

create or replace function public.sp_blocking_state()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select public.sp__blocking(auth.uid());
$fn$;

-- Called by the app server's scheduler loop (service role). Advances every due
-- timer, then returns each completed phase that has not been notified yet,
-- marking it notified in the same statement so a push is sent exactly once
-- no matter which device or process advanced the timer.
create or replace function public.sp_scheduler_tick()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  r record;
  v_out jsonb;
begin
  for r in
    select st.user_id, st.version from public.sp_focus_state st
     where st.status = 'running' and st.phase_ends_at <= clock_timestamp()
  loop
    perform public.sp__timer_apply(r.user_id, 'advance', r.version, clock_timestamp());
  end loop;

  with pending as (
    update public.sp_focus_state st
       set notified_phase_end_at = st.last_completed_at
     where st.last_completed_at is not null
       and (st.notified_phase_end_at is null or st.notified_phase_end_at < st.last_completed_at)
    returning st.user_id, st.last_completed_phase, st.last_completed_at, st.phase, st.status
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.user_id,
           'completed_phase', p.last_completed_phase,
           'completed_at', p.last_completed_at,
           'next_phase', p.phase,
           'status', p.status,
           'stale', p.last_completed_at < clock_timestamp() - interval '10 minutes',
           'settings', to_jsonb(cfg))), '[]'::jsonb)
    into v_out
    from pending p join public.sp_focus_settings cfg on cfg.user_id = p.user_id;
  return v_out;
end;
$fn$;

-- Focus statistics in the owner's time zone.
create or replace function public.sp_focus_stats(p_days int default 30)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_tz text := public.sp__timezone(auth.uid());
  v_today date := public.sp_today();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 366);
  v_series jsonb;
  v_today_seconds bigint;
  v_total_seconds bigint;
  v_streak int := 0;
  v_cursor date;
  v_has boolean;
begin
  select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'minutes', round(coalesce(x.seconds, 0) / 60.0)) order by d.day), '[]'::jsonb)
    into v_series
    from (select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as day) d
    left join (
      select (s.ended_at at time zone v_tz)::date as day, sum(s.actual_seconds) as seconds
        from public.sp_focus_sessions s
       where s.user_id = v_user and s.phase = 'focus'
         and s.ended_at >= ((v_today - v_days)::timestamp at time zone v_tz)
       group by 1
    ) x on x.day = d.day;

  select coalesce(sum(s.actual_seconds) filter (where (s.ended_at at time zone v_tz)::date = v_today), 0),
         coalesce(sum(s.actual_seconds), 0)
    into v_today_seconds, v_total_seconds
    from public.sp_focus_sessions s
   where s.user_id = v_user and s.phase = 'focus';

  -- Consecutive days with focus time, ending today or yesterday.
  v_cursor := v_today;
  loop
    select exists (
      select 1 from public.sp_focus_sessions s
       where s.user_id = v_user and s.phase = 'focus' and s.actual_seconds >= 60
         and (s.ended_at at time zone v_tz)::date = v_cursor) into v_has;
    if v_has then
      v_streak := v_streak + 1;
    elsif v_cursor <> v_today then
      exit;
    end if;
    v_cursor := v_cursor - 1;
    exit when v_today - v_cursor > 3660;
  end loop;

  return jsonb_build_object(
    'today', v_today,
    'today_minutes', round(v_today_seconds / 60.0),
    'total_minutes', round(v_total_seconds / 60.0),
    'streak_days', v_streak,
    'days', v_series);
end;
$fn$;

revoke all on function public.sp_normalize_site(text) from public, anon;
revoke all on function public.sp__focus_ensure(uuid) from public, anon, authenticated;
revoke all on function public.sp__phase_ms(public.sp_focus_settings, text) from public, anon;
revoke all on function public.sp__ms_between(timestamptz, timestamptz) from public, anon;
revoke all on function public.sp__timer_apply(uuid, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.sp_timer_action(text, bigint) from public, anon;
revoke all on function public.sp__blocking(uuid) from public, anon, authenticated;
revoke all on function public.sp_focus_get() from public, anon;
revoke all on function public.sp_blocking_state() from public, anon;
revoke all on function public.sp_scheduler_tick() from public, anon, authenticated;
revoke all on function public.sp_focus_stats(int) from public, anon;
grant execute on function public.sp_normalize_site(text) to authenticated, service_role;
grant execute on function public.sp__focus_ensure(uuid) to service_role;
grant execute on function public.sp__phase_ms(public.sp_focus_settings, text) to authenticated, service_role;
grant execute on function public.sp__ms_between(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.sp__timer_apply(uuid, text, bigint, timestamptz) to service_role;
grant execute on function public.sp_timer_action(text, bigint) to authenticated, service_role;
grant execute on function public.sp__blocking(uuid) to service_role;
grant execute on function public.sp_focus_get() to authenticated, service_role;
grant execute on function public.sp_blocking_state() to authenticated, service_role;
grant execute on function public.sp_scheduler_tick() to service_role;
grant execute on function public.sp_focus_stats(int) to authenticated, service_role;
