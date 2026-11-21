-- Stellar Planner · 0003 · goals and goal lists.

create table if not exists public.sp_goal_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '🎯',
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_goal_lists_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint sp_goal_lists_emoji_chk check (char_length(emoji) between 1 and 32)
);
create index if not exists sp_goal_lists_user_idx on public.sp_goal_lists (user_id, sort_order) where deleted_at is null;
create index if not exists sp_goal_lists_updated_idx on public.sp_goal_lists (user_id, updated_at);

create table if not exists public.sp_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid not null references public.sp_goal_lists(id) on delete cascade,
  name text not null,
  description text,
  type text not null default 'todo',
  current_amount numeric not null default 0,
  total_amount numeric,
  unit text,
  completed boolean not null default false,
  completed_at timestamptz,
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_goals_name_chk check (char_length(btrim(name)) between 1 and 500),
  constraint sp_goals_description_chk check (description is null or char_length(description) <= 5000),
  constraint sp_goals_type_chk check (type in ('todo', 'progress')),
  constraint sp_goals_total_chk check (type = 'todo' or (total_amount is not null and total_amount > 0)),
  constraint sp_goals_current_chk check (current_amount >= 0),
  constraint sp_goals_unit_chk check (unit is null or char_length(unit) <= 40)
);
create index if not exists sp_goals_list_idx on public.sp_goals (list_id, sort_order) where deleted_at is null;
create index if not exists sp_goals_updated_idx on public.sp_goals (user_id, updated_at);

create or replace function public.sp_goal_lists_before()
returns trigger language plpgsql as $fn$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(l.sort_order), 0) + 1024 into new.sort_order
        from public.sp_goal_lists l where l.user_id = new.user_id;
    end if;
  else
    new.user_id := old.user_id;
    if new.sort_order is null then new.sort_order := old.sort_order; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_goal_lists_before on public.sp_goal_lists;
create trigger sp_goal_lists_before before insert or update on public.sp_goal_lists
  for each row execute function public.sp_goal_lists_before();

create or replace function public.sp_goal_lists_after_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.sp_goals set deleted_at = new.deleted_at
     where list_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.sp_goals set deleted_at = null
     where list_id = new.id and deleted_at = old.deleted_at;
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_goal_lists_after_update on public.sp_goal_lists;
create trigger sp_goal_lists_after_update after update of deleted_at on public.sp_goal_lists
  for each row execute function public.sp_goal_lists_after_update();

create or replace function public.sp_goals_before()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_was_completed boolean := false;
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.unit := nullif(btrim(coalesce(new.unit, '')), '');

  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    v_was_completed := old.completed;
  end if;

  if not exists (select 1 from public.sp_goal_lists l where l.id = new.list_id and l.user_id = new.user_id) then
    raise exception 'Goal list not found' using errcode = '23503';
  end if;

  if new.type = 'progress' then
    new.current_amount := greatest(coalesce(new.current_amount, 0), 0);
    -- For progress goals, completion is derived from the amounts.
    new.completed := new.total_amount is not null and new.current_amount >= new.total_amount;
  else
    new.total_amount := null;
    new.unit := null;
    new.current_amount := case when new.completed then 1 else 0 end;
  end if;

  if new.completed and not v_was_completed then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' then
    new.completed_at := coalesce(old.completed_at, now());
  end if;

  if new.sort_order is null
     or (tg_op = 'UPDATE' and new.list_id is distinct from old.list_id and new.sort_order = old.sort_order) then
    select coalesce(max(g.sort_order), 0) + 1024 into new.sort_order
      from public.sp_goals g where g.list_id = new.list_id and g.id <> new.id;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_goals_before on public.sp_goals;
create trigger sp_goals_before before insert or update on public.sp_goals
  for each row execute function public.sp_goals_before();

alter table public.sp_goal_lists enable row level security;
drop policy if exists sp_goal_lists_owner on public.sp_goal_lists;
create policy sp_goal_lists_owner on public.sp_goal_lists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.sp_goals enable row level security;
drop policy if exists sp_goals_owner on public.sp_goals;
create policy sp_goals_owner on public.sp_goals
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_goal_lists, public.sp_goals from anon;
grant select, insert, update, delete on public.sp_goal_lists, public.sp_goals to authenticated;
grant all on public.sp_goal_lists, public.sp_goals to service_role;

-- Goal progress 0…1: todo → 0 or 1; progress → min(current / total, 1).
create or replace function public.sp_goal_progress(g public.sp_goals)
returns numeric language sql immutable as $fn$
  select case
    when g.type = 'todo' then case when g.completed then 1 else 0 end
    when g.total_amount is null or g.total_amount <= 0 then 0
    else least(greatest(g.current_amount / g.total_amount, 0), 1)
  end::numeric;
$fn$;

-- Adds delta (may be negative) to a progress goal, never going below zero.
create or replace function public.sp_goal_increment(p_goal_id uuid, p_delta numeric)
returns public.sp_goals language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_goal public.sp_goals;
begin
  update public.sp_goals g
     set current_amount = greatest(g.current_amount + p_delta, 0)
   where g.id = p_goal_id and g.user_id = auth.uid() and g.deleted_at is null and g.type = 'progress'
  returning g.* into v_goal;
  if not found then
    raise exception 'Progress goal not found' using errcode = 'P0002';
  end if;
  return v_goal;
end;
$fn$;

-- Per-list progress: mean of goal progress, plus "X of Y complete".
create or replace function public.sp_goal_list_progress()
returns table (list_id uuid, total int, complete int, fraction numeric)
language sql stable set search_path = public, pg_temp as $fn$
  select l.id,
         count(g.id)::int,
         count(g.id) filter (where g.completed)::int,
         coalesce(avg(public.sp_goal_progress(g)), 0)::numeric
    from public.sp_goal_lists l
    left join public.sp_goals g on g.list_id = l.id and g.deleted_at is null
   where l.user_id = auth.uid() and l.deleted_at is null
   group by l.id;
$fn$;

revoke all on function public.sp_goal_progress(public.sp_goals) from public, anon;
revoke all on function public.sp_goal_increment(uuid, numeric) from public, anon;
revoke all on function public.sp_goal_list_progress() from public, anon;
grant execute on function public.sp_goal_progress(public.sp_goals) to authenticated, service_role;
grant execute on function public.sp_goal_increment(uuid, numeric) to authenticated, service_role;
grant execute on function public.sp_goal_list_progress() to authenticated, service_role;
