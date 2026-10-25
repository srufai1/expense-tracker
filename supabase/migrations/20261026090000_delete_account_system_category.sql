-- Fix for "Delete my account" (D-51): it failed for every real account,
-- because deleting the login also deletes the user's categories, and the
-- system category Fees & Charges refused to be deleted (D-07, D-32).
--
-- The rule stays: a user can never delete Fees & Charges on its own. It may
-- only go together with its user. When the login is deleted, its auth.users
-- row is already gone by the time its categories are removed, so "the owner
-- no longer exists" means "the whole account is being deleted".
--
-- SECURITY DEFINER so the check can read auth.users (users cannot).
create or replace function public.categories_protect_system()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.system_key is not null
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    raise exception 'categories: % is a system category and cannot be deleted', old.name
      using errcode = '23514';
  end if;
  return old;
end;
$$;

revoke execute on function public.categories_protect_system() from public, anon, authenticated;
