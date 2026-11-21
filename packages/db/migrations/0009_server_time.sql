-- 0009: the database clock, for delta sync.
--
-- `updated_at` and tombstone times are stamped by Postgres. A sync cursor must
-- come from the same clock: if the API used the app server's clock instead,
-- any skew between the two machines could make a client miss a change.

create or replace function public.sp_now()
returns timestamptz language sql stable set search_path = public, pg_temp as $fn$
  select clock_timestamp();
$fn$;

revoke all on function public.sp_now() from public, anon;
grant execute on function public.sp_now() to authenticated, service_role;
