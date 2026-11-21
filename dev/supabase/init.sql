-- Minimal Supabase-compatible bootstrap for a stock Postgres image (dev/test only).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'postgres';
grant anon, authenticated, service_role to authenticator;
create role supabase_admin login superuser password 'postgres';
create role supabase_auth_admin login createrole noinherit password 'postgres';
create role supabase_realtime_admin nologin noinherit;
create role dashboard_user nologin;

create schema if not exists auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
create schema if not exists _realtime authorization supabase_admin;
create schema if not exists realtime authorization supabase_admin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role, postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter role postgres set search_path = public, extensions;
alter role authenticator set search_path = public, extensions;
alter database postgres set search_path = public, extensions;

create publication supabase_realtime;
