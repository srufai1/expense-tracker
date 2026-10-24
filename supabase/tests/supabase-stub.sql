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

-- Supabase Storage, as far as our policies use it: buckets, objects (RLS
-- on, like on Supabase) and the path helpers storage.foldername() and
-- storage.filename(). On Supabase the Storage API writes these rows.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
grant select on storage.buckets to anon, authenticated, service_role;

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select, insert, update, delete on storage.objects to service_role;

-- "a/b/c.jpg" → {a,b}; like Supabase's storage.foldername.
create function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- "a/b/c.jpg" → "c.jpg"; like Supabase's storage.filename.
create function storage.filename(name text)
returns text
language sql
immutable
as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
