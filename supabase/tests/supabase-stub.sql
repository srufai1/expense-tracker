-- The parts of a Supabase database our migrations depend on, recreated for
-- tests in PGlite (an in-memory Postgres). Real Supabase already has these;
-- this file is never run against a real project.

-- Roles the Data API uses: `anon` (signed out), `authenticated` (signed in),
-- and `service_role` (the secret key, used only by the daily job). Like on
-- Supabase, service_role bypasses Row-Level Security.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id uuid primary key
);

-- Like Supabase's auth.uid(): the signed-in user's id from the request's
-- JWT, or null when signed out. Tests set request.jwt.claim.sub.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
