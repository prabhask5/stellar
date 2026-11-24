-- 0010: fixes from polish pass 1 (docs/polish/AUDIT.md). Idempotent like every migration.

-- ── replay-safe goal increments ────────────────────────────────────────────
-- A queued "+1" can be sent twice: the response was lost, or two tabs replayed the
-- same queue. Deltas are not idempotent, so each increment carries an operation id
-- and is applied at most once.
create table if not exists public.sp_applied_ops (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  op_id uuid not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
create index if not exists sp_applied_ops_applied_idx on public.sp_applied_ops (applied_at);
alter table public.sp_applied_ops enable row level security;
drop policy if exists sp_applied_ops_owner on public.sp_applied_ops;
create policy sp_applied_ops_owner on public.sp_applied_ops
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sp_applied_ops from anon, authenticated;
grant select on public.sp_applied_ops to authenticated;
grant all on public.sp_applied_ops to service_role;

-- A goal that no longer exists is not an error for a replayed change: the function
-- returns null and the client refreshes. (Raising P0002 made PostgREST answer 500,
-- which clients must treat as "try again later", so one doomed change blocked the
-- whole sync queue.)
create or replace function public.sp_goal_increment(p_goal_id uuid, p_delta numeric, p_op_id uuid)
returns public.sp_goals language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_goal public.sp_goals;
  v_new int;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_delta is null or p_delta = 'NaN'::numeric or p_delta in ('Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  if p_op_id is not null then
    insert into public.sp_applied_ops (user_id, op_id) values (v_user, p_op_id)
    on conflict (user_id, op_id) do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then
      select g.* into v_goal from public.sp_goals g
       where g.id = p_goal_id and g.user_id = v_user and g.deleted_at is null;
      if not found then return null; end if;
      return v_goal;
    end if;
  end if;
  update public.sp_goals g
     set current_amount = greatest(g.current_amount + p_delta, 0)
   where g.id = p_goal_id and g.user_id = v_user and g.deleted_at is null and g.type = 'progress'
  returning g.* into v_goal;
  if not found then return null; end if;
  return v_goal;
end;
$fn$;
revoke all on function public.sp_goal_increment(uuid, numeric, uuid) from public, anon;
grant execute on function public.sp_goal_increment(uuid, numeric, uuid) to authenticated, service_role;

create or replace function public.sp_goal_increment(p_goal_id uuid, p_delta numeric)
returns public.sp_goals language sql volatile set search_path = public, pg_temp as $fn$
  select public.sp_goal_increment(p_goal_id, p_delta, null::uuid);
$fn$;

-- Same for a day's result of a routine that was deleted on another device.
create or replace function public.sp_routine_log_set(
  p_routine_id uuid, p_date date, p_completed boolean default null, p_amount numeric default null
) returns public.sp_routine_logs language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_log public.sp_routine_logs;
begin
  if p_amount is not null and (p_amount = 'NaN'::numeric or p_amount in ('Infinity'::numeric, '-Infinity'::numeric)) then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sp_routines r where r.id = p_routine_id and r.user_id = auth.uid()) then
    return null;
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

-- Applied-operation ids are only needed while a change can still be replayed.
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
  delete from public.sp_applied_ops where applied_at < now() - interval '30 days';
  return v_total;
end;
$fn$;
