-- Stellar Planner · 0001 · core: version table, helpers, settings, quotes, devices, push, audit.
-- Every statement is idempotent so the whole file can be pasted into a SQL editor more than once.

create table if not exists public.sp_schema_version (
  version int primary key,
  applied_at timestamptz not null default now()
);
alter table public.sp_schema_version enable row level security;
drop policy if exists sp_schema_version_read on public.sp_schema_version;
create policy sp_schema_version_read on public.sp_schema_version
  for select to authenticated, service_role using (true);
revoke all on public.sp_schema_version from anon;
grant select on public.sp_schema_version to authenticated;
grant all on public.sp_schema_version to service_role;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.sp_set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- Soft-deleted rows are purged after 30 days; hard deletes leave a tombstone so
-- offline clients and delta sync (`updated_since`) can learn about them.
create table if not exists public.sp_tombstones (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  row_key text,
  deleted_at timestamptz not null default now()
);
create index if not exists sp_tombstones_user_idx on public.sp_tombstones (user_id, table_name, deleted_at);
alter table public.sp_tombstones enable row level security;
drop policy if exists sp_tombstones_owner on public.sp_tombstones;
create policy sp_tombstones_owner on public.sp_tombstones
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sp_tombstones from anon, authenticated;
grant select on public.sp_tombstones to authenticated;
grant all on public.sp_tombstones to service_role;

create or replace function public.sp_record_tombstone()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- Skip when the owner account itself is being removed.
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.sp_tombstones (user_id, table_name, row_id) values (old.user_id, tg_table_name, old.id);
  end if;
  return old;
end;
$fn$;

-- ── settings ───────────────────────────────────────────────────────────────
create table if not exists public.sp_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  week_start smallint not null default 1,
  birthdate date,
  lifespan_years int not null default 85,
  quality_tier text not null default 'auto',
  show_completed boolean not null default false,
  lock_after_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_settings_week_start_chk check (week_start in (0, 1)),
  constraint sp_settings_lifespan_chk check (lifespan_years between 1 and 150),
  constraint sp_settings_quality_chk check (quality_tier in ('auto', 'cinematic', 'balanced', 'minimal')),
  constraint sp_settings_lock_chk check (lock_after_minutes is null or lock_after_minutes > 0)
);

create or replace function public.sp_settings_before()
returns trigger language plpgsql as $fn$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  if new.birthdate is not null and new.birthdate > (now() at time zone new.timezone)::date then
    raise exception 'Birthdate cannot be in the future' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_settings_before on public.sp_settings;
create trigger sp_settings_before before insert or update on public.sp_settings
  for each row execute function public.sp_settings_before();

alter table public.sp_settings enable row level security;
drop policy if exists sp_settings_owner on public.sp_settings;
create policy sp_settings_owner on public.sp_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_settings from anon;
grant select, insert, update on public.sp_settings to authenticated;
grant all on public.sp_settings to service_role;

-- Owner's time zone and "today" in it. Used by every date-based view and RPC.
create or replace function public.sp__timezone(p_user uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((select s.timezone from public.sp_settings s where s.user_id = p_user), 'UTC');
$fn$;

create or replace function public.sp__today(p_user uuid, p_now timestamptz default now())
returns date language sql stable security definer set search_path = public, pg_temp as $fn$
  select (p_now at time zone public.sp__timezone(p_user))::date;
$fn$;

create or replace function public.sp_today()
returns date language sql stable set search_path = public, pg_temp as $fn$
  select public.sp__today(auth.uid());
$fn$;

revoke all on function public.sp__timezone(uuid) from public, anon;
revoke all on function public.sp__today(uuid, timestamptz) from public, anon;
revoke all on function public.sp_today() from public, anon;
grant execute on function public.sp__timezone(uuid) to authenticated, service_role;
grant execute on function public.sp__today(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.sp_today() to authenticated, service_role;

-- ── quotes ─────────────────────────────────────────────────────────────────
create table if not exists public.sp_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  author text not null default '',
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_quotes_text_chk check (char_length(btrim(text)) between 1 and 500),
  constraint sp_quotes_author_chk check (char_length(author) <= 120),
  constraint sp_quotes_owner_chk check (is_builtin = (user_id is null))
);
create unique index if not exists sp_quotes_builtin_uniq on public.sp_quotes (text) where is_builtin;
create index if not exists sp_quotes_user_idx on public.sp_quotes (user_id) where not is_builtin;
drop trigger if exists sp_quotes_updated on public.sp_quotes;
create trigger sp_quotes_updated before update on public.sp_quotes
  for each row execute function public.sp_set_updated_at();
drop trigger if exists sp_quotes_tombstone on public.sp_quotes;
create trigger sp_quotes_tombstone after delete on public.sp_quotes
  for each row when (old.user_id is not null) execute function public.sp_record_tombstone();

alter table public.sp_quotes enable row level security;
drop policy if exists sp_quotes_read on public.sp_quotes;
create policy sp_quotes_read on public.sp_quotes
  for select to authenticated using (is_builtin or user_id = (select auth.uid()));
drop policy if exists sp_quotes_insert on public.sp_quotes;
create policy sp_quotes_insert on public.sp_quotes
  for insert to authenticated with check (not is_builtin and user_id = (select auth.uid()));
drop policy if exists sp_quotes_update on public.sp_quotes;
create policy sp_quotes_update on public.sp_quotes
  for update to authenticated using (not is_builtin and user_id = (select auth.uid()))
  with check (not is_builtin and user_id = (select auth.uid()));
drop policy if exists sp_quotes_delete on public.sp_quotes;
create policy sp_quotes_delete on public.sp_quotes
  for delete to authenticated using (not is_builtin and user_id = (select auth.uid()));
revoke all on public.sp_quotes from anon;
grant select, insert, update, delete on public.sp_quotes to authenticated;
grant all on public.sp_quotes to service_role;

create or replace function public.sp_random_quote()
returns public.sp_quotes language sql volatile set search_path = public, pg_temp as $fn$
  select q.* from public.sp_quotes q
  where q.is_builtin or q.user_id = auth.uid()
  order by random() limit 1;
$fn$;
revoke all on function public.sp_random_quote() from public, anon;
grant execute on function public.sp_random_quote() to authenticated, service_role;

-- ── devices, push subscriptions, auth audit ────────────────────────────────
create table if not exists public.sp_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  last_seen_at timestamptz not null default now(),
  auth_session_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_devices_kind_chk check (kind in ('web', 'pwa', 'extension', 'ios')),
  constraint sp_devices_name_chk check (char_length(btrim(name)) between 1 and 120)
);
create index if not exists sp_devices_user_idx on public.sp_devices (user_id, last_seen_at desc);
create index if not exists sp_devices_session_idx on public.sp_devices (auth_session_id);
drop trigger if exists sp_devices_updated on public.sp_devices;
create trigger sp_devices_updated before update on public.sp_devices
  for each row execute function public.sp_set_updated_at();
alter table public.sp_devices enable row level security;
drop policy if exists sp_devices_owner on public.sp_devices;
create policy sp_devices_owner on public.sp_devices
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sp_devices from anon, authenticated;
grant select on public.sp_devices to authenticated;
grant all on public.sp_devices to service_role;

-- Marks the calling session's device as seen. The session id comes from the JWT.
create or replace function public.sp_device_seen()
returns void language sql volatile security definer set search_path = public, pg_temp as $fn$
  update public.sp_devices d
     set last_seen_at = now()
   where d.user_id = auth.uid()
     and d.revoked_at is null
     and d.auth_session_id = nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', ''), '')::uuid
     and d.last_seen_at < now() - interval '1 minute';
$fn$;
revoke all on function public.sp_device_seen() from public, anon;
grant execute on function public.sp_device_seen() to authenticated, service_role;

create table if not exists public.sp_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_id uuid references public.sp_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_push_endpoint_uniq unique (endpoint),
  constraint sp_push_endpoint_chk check (endpoint ~ '^https://')
);
create index if not exists sp_push_user_idx on public.sp_push_subscriptions (user_id);
drop trigger if exists sp_push_updated on public.sp_push_subscriptions;
create trigger sp_push_updated before update on public.sp_push_subscriptions
  for each row execute function public.sp_set_updated_at();
alter table public.sp_push_subscriptions enable row level security;
drop policy if exists sp_push_owner on public.sp_push_subscriptions;
create policy sp_push_owner on public.sp_push_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_push_subscriptions from anon;
grant select, insert, update, delete on public.sp_push_subscriptions to authenticated;
grant all on public.sp_push_subscriptions to service_role;

create table if not exists public.sp_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  device_kind text,
  ip text,
  created_at timestamptz not null default now(),
  constraint sp_auth_events_kind_chk check (kind in (
    'pin_success', 'pin_failure', 'pin_locked', 'pin_changed', 'pin_reset',
    'signed_out', 'signed_out_everywhere', 'device_revoked'))
);
create index if not exists sp_auth_events_user_idx on public.sp_auth_events (user_id, created_at desc);
alter table public.sp_auth_events enable row level security;
drop policy if exists sp_auth_events_owner on public.sp_auth_events;
create policy sp_auth_events_owner on public.sp_auth_events
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sp_auth_events from anon, authenticated;
grant select on public.sp_auth_events to authenticated;
grant all on public.sp_auth_events to service_role;
