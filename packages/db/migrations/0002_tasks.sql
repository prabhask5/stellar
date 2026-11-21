-- Stellar Planner · 0002 · tasks and task lists.

create table if not exists public.sp_task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📋',
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_task_lists_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint sp_task_lists_emoji_chk check (char_length(emoji) between 1 and 32)
);
create index if not exists sp_task_lists_user_idx on public.sp_task_lists (user_id, sort_order) where deleted_at is null;
create index if not exists sp_task_lists_updated_idx on public.sp_task_lists (user_id, updated_at);

create table if not exists public.sp_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  due_date date,
  due_time time,
  list_id uuid references public.sp_task_lists(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_tasks_name_chk check (char_length(btrim(name)) between 1 and 500),
  constraint sp_tasks_description_chk check (description is null or char_length(description) <= 5000),
  -- List tasks have no dates.
  constraint sp_tasks_list_no_dates_chk check (list_id is null or (due_date is null and due_time is null)),
  constraint sp_tasks_time_needs_date_chk check (due_time is null or due_date is not null)
);
create index if not exists sp_tasks_due_idx on public.sp_tasks (user_id, due_date, due_time)
  where deleted_at is null and list_id is null;
create index if not exists sp_tasks_list_idx on public.sp_tasks (list_id, sort_order) where deleted_at is null;
create index if not exists sp_tasks_updated_idx on public.sp_tasks (user_id, updated_at);
create index if not exists sp_tasks_completed_idx on public.sp_tasks (user_id, completed_at) where completed;

-- ── triggers ───────────────────────────────────────────────────────────────
create or replace function public.sp_task_lists_before()
returns trigger language plpgsql as $fn$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(l.sort_order), 0) + 1024 into new.sort_order
        from public.sp_task_lists l where l.user_id = new.user_id;
    end if;
  else
    new.user_id := old.user_id;
    if new.sort_order is null then new.sort_order := old.sort_order; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_task_lists_before on public.sp_task_lists;
create trigger sp_task_lists_before before insert or update on public.sp_task_lists
  for each row execute function public.sp_task_lists_before();

-- Soft-deleting a list soft-deletes its tasks with the same timestamp, so an
-- undo (deleted_at back to null) can restore exactly those tasks.
create or replace function public.sp_task_lists_after_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.sp_tasks set deleted_at = new.deleted_at
     where list_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.sp_tasks set deleted_at = null
     where list_id = new.id and deleted_at = old.deleted_at;
  end if;
  return null;
end;
$fn$;
drop trigger if exists sp_task_lists_after_update on public.sp_task_lists;
create trigger sp_task_lists_after_update after update of deleted_at on public.sp_task_lists
  for each row execute function public.sp_task_lists_after_update();

create or replace function public.sp_tasks_before()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');

  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;

  if new.list_id is not null then
    if not exists (select 1 from public.sp_task_lists l where l.id = new.list_id and l.user_id = new.user_id) then
      raise exception 'Task list not found' using errcode = '23503';
    end if;
    -- Moving a task into a list clears its dates.
    new.due_date := null;
    new.due_time := null;
  end if;
  if new.due_date is null then
    new.due_time := null;
  end if;

  if tg_op = 'INSERT' then
    if new.completed then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  elsif new.completed is distinct from old.completed then
    new.completed_at := case when new.completed then now() else null end;
  elsif not new.completed then
    new.completed_at := null;
  else
    new.completed_at := coalesce(new.completed_at, old.completed_at, now());
  end if;

  if new.sort_order is null
     or (tg_op = 'UPDATE' and new.list_id is distinct from old.list_id and new.sort_order = old.sort_order) then
    select coalesce(max(t.sort_order), 0) + 1024 into new.sort_order
      from public.sp_tasks t
     where t.user_id = new.user_id
       and t.list_id is not distinct from new.list_id
       and t.id <> new.id;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;
drop trigger if exists sp_tasks_before on public.sp_tasks;
create trigger sp_tasks_before before insert or update on public.sp_tasks
  for each row execute function public.sp_tasks_before();

-- ── row level security ─────────────────────────────────────────────────────
alter table public.sp_task_lists enable row level security;
drop policy if exists sp_task_lists_owner on public.sp_task_lists;
create policy sp_task_lists_owner on public.sp_task_lists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.sp_tasks enable row level security;
drop policy if exists sp_tasks_owner on public.sp_tasks;
create policy sp_tasks_owner on public.sp_tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sp_task_lists, public.sp_tasks from anon;
grant select, insert, update, delete on public.sp_task_lists, public.sp_tasks to authenticated;
grant all on public.sp_task_lists, public.sp_tasks to service_role;

-- ── views as functions (owner time zone) ───────────────────────────────────
-- view: today | all | calendar | list.  Mirrors SPEC §5.1 exactly.
create or replace function public.sp_tasks_view(
  p_view text,
  p_list_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_include_completed boolean default false
)
returns setof public.sp_tasks language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_today date := public.sp_today();
begin
  if p_view = 'today' then
    return query
      select t.* from public.sp_tasks t
       where t.user_id = auth.uid() and t.deleted_at is null and t.list_id is null
         and t.due_date <= v_today
         and (not t.completed or (p_include_completed and t.due_date = v_today))
       order by t.due_date, t.due_time nulls last, t.sort_order;
  elsif p_view = 'all' then
    return query
      select t.* from public.sp_tasks t
       where t.user_id = auth.uid() and t.deleted_at is null and t.list_id is null
         and (p_include_completed or not t.completed)
       order by t.due_date nulls last, t.due_time nulls last, t.sort_order;
  elsif p_view = 'calendar' then
    return query
      select t.* from public.sp_tasks t
       where t.user_id = auth.uid() and t.deleted_at is null and t.list_id is null
         and t.due_date is not null
         and (p_from is null or t.due_date >= p_from)
         and (p_to is null or t.due_date <= p_to)
         and (p_include_completed or not t.completed)
       order by t.due_date, t.due_time nulls last, t.sort_order;
  elsif p_view = 'list' then
    if p_list_id is null then
      raise exception 'list_id is required for the list view' using errcode = '22023';
    end if;
    return query
      select t.* from public.sp_tasks t
       where t.user_id = auth.uid() and t.deleted_at is null and t.list_id = p_list_id
         and (p_include_completed or not t.completed)
       order by t.sort_order, t.created_at;
  else
    raise exception 'Unknown view: %', p_view using errcode = '22023';
  end if;
end;
$fn$;

-- Moves every incomplete overdue non-list task to today, keeping due_time.
-- Returns the count and the previous dates so the client can offer Undo.
create or replace function public.sp_postpone_overdue_to_today()
returns jsonb language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_today date := public.sp_today();
  v_moved jsonb;
begin
  with overdue as (
    select t.id, t.due_date from public.sp_tasks t
     where t.user_id = auth.uid() and t.deleted_at is null and t.list_id is null
       and not t.completed and t.due_date < v_today
     for update
  ), upd as (
    update public.sp_tasks t set due_date = v_today
      from overdue o where t.id = o.id
    returning o.id, o.due_date
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'due_date', due_date)), '[]'::jsonb)
    into v_moved from upd;
  return jsonb_build_object('count', jsonb_array_length(v_moved), 'today', v_today, 'moved', v_moved);
end;
$fn$;

-- Undo for the above: restores the due dates returned in `moved`.
create or replace function public.sp_restore_due_dates(p_moved jsonb)
returns int language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_count int;
begin
  with src as (
    select (e ->> 'id')::uuid as id, (e ->> 'due_date')::date as due_date
      from jsonb_array_elements(coalesce(p_moved, '[]'::jsonb)) e
  ), upd as (
    update public.sp_tasks t set due_date = s.due_date
      from src s
     where t.id = s.id and t.user_id = auth.uid() and t.list_id is null
    returning 1
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$fn$;

revoke all on function public.sp_tasks_view(text, uuid, date, date, boolean) from public, anon;
revoke all on function public.sp_postpone_overdue_to_today() from public, anon;
revoke all on function public.sp_restore_due_dates(jsonb) from public, anon;
grant execute on function public.sp_tasks_view(text, uuid, date, date, boolean) to authenticated, service_role;
grant execute on function public.sp_postpone_overdue_to_today() to authenticated, service_role;
grant execute on function public.sp_restore_due_dates(jsonb) to authenticated, service_role;
