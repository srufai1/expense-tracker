-- Failed-attempt lockout (D-49): 5 failures within 20 minutes lock for 20
-- minutes. Three kinds:
--   sign-in   per email (lower case), before Supabase checks the password;
--   invite    per network address, for the sign-up invite code (D-45);
--   password  per signed-in user, for Settings → Change password (D-48).
--
-- The table is closed to everyone (RLS on, no policies, no grants). It is
-- used only through the functions below, which run as their owner and
-- check who may do what, so a visitor cannot read the counters or reset
-- them. No secret key is needed.
create table public.auth_attempts (
  key text primary key,
  failures integer not null default 0,
  first_failed_at timestamptz,
  locked_until timestamptz
);

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from public, anon, authenticated;

-- The key for one kind and subject. The password kind always uses the
-- signed-in user's own id, whatever subject is given.
create function public.auth_attempt_key(p_kind text, p_subject text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  subject text := lower(btrim(coalesce(p_subject, '')));
begin
  if p_kind not in ('sign-in', 'invite', 'password') then
    raise exception 'auth_attempts: unknown kind' using errcode = '22023';
  end if;
  if p_kind = 'password' then
    if (select auth.uid()) is null then
      raise exception 'auth_attempts: not signed in' using errcode = '42501';
    end if;
    return 'password:' || (select auth.uid())::text;
  end if;
  if char_length(subject) > 254 then
    raise exception 'auth_attempts: subject too long' using errcode = '22001';
  end if;
  return p_kind || ':' || subject;
end;
$$;

-- When the lock ends, or null when not locked.
create function public.auth_attempt_lock(p_kind text, p_subject text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select a.locked_until from public.auth_attempts a
  where a.key = public.auth_attempt_key(p_kind, p_subject) and a.locked_until > now()
$$;

-- Records one failure. Returns when the lock ends if this failure (or an
-- earlier one) locked the key, otherwise null.
create function public.auth_attempt_failed(p_kind text, p_subject text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.auth_attempt_key(p_kind, p_subject);
  row public.auth_attempts;
begin
  -- Old rows are not needed; removing them keeps the table small.
  delete from public.auth_attempts
  where coalesce(locked_until, first_failed_at) < now() - interval '1 day';

  insert into public.auth_attempts (key) values (k) on conflict (key) do nothing;
  select * into row from public.auth_attempts where key = k for update;

  if row.locked_until > now() then
    return row.locked_until;
  end if;
  -- A new count after a lock ended, or when the first failure is too old.
  if row.locked_until is not null or row.first_failed_at < now() - interval '20 minutes' then
    row.failures := 0;
    row.first_failed_at := null;
    row.locked_until := null;
  end if;

  row.failures := row.failures + 1;
  row.first_failed_at := coalesce(row.first_failed_at, now());
  if row.failures >= 5 then
    row.locked_until := now() + interval '20 minutes';
  end if;

  update public.auth_attempts
  set failures = row.failures, first_failed_at = row.first_failed_at, locked_until = row.locked_until
  where key = k;
  return row.locked_until;
end;
$$;

-- After a success: clears the signed-in user's own sign-in counter (by
-- their email) or password counter. Never anyone else's, and never the
-- invite counter (it ends on its own).
create function public.auth_attempt_cleared(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'auth_attempts: not signed in' using errcode = '42501';
  end if;
  if p_kind = 'sign-in' then
    delete from public.auth_attempts
    where key = 'sign-in:' || lower((select u.email from auth.users u where u.id = uid));
  elsif p_kind = 'password' then
    delete from public.auth_attempts where key = 'password:' || uid::text;
  else
    raise exception 'auth_attempts: unknown kind' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.auth_attempt_key(text, text) from public, anon, authenticated;
revoke execute on function public.auth_attempt_lock(text, text) from public;
revoke execute on function public.auth_attempt_failed(text, text) from public;
revoke execute on function public.auth_attempt_cleared(text) from public, anon;
grant execute on function public.auth_attempt_lock(text, text) to anon, authenticated;
grant execute on function public.auth_attempt_failed(text, text) to anon, authenticated;
grant execute on function public.auth_attempt_cleared(text) to authenticated;
