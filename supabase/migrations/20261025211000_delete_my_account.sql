-- "Delete my account" (D-51). Deletes the signed-in user's login; every
-- table's user_id has ON DELETE CASCADE, so all their accounts,
-- transactions, categories, budgets, goals, recurring items, settings and
-- email log go with it, in one step. The app removes the user's photos
-- (receipts and profile photo) from Storage first: files are not rows the
-- database can cascade.
--
-- SECURITY DEFINER because users cannot touch auth.users themselves; the
-- function only ever deletes the caller.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'delete_my_account: not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
