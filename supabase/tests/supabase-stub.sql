-- The parts of a Supabase database our migrations depend on, recreated for
-- tests in PGlite (an in-memory Postgres). Real Supabase already has these;
-- this file is never run against a real project.

-- Roles the Data API uses: `anon` (signed out), `authenticated` (signed in).
create role anon nologin;
create role authenticated nologin;

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

grant usage on schema public to anon, authenticated;
