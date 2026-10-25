-- Deleting a sub-category that has been used (D-44). Its transactions and
-- recurring items move to its parent category, and its budgets are removed;
-- then the sub-category is deleted. All of it happens together or not at
-- all. A top-level category still follows D-32: deleted only when unused,
-- archived otherwise.
--
-- SECURITY DEFINER because budgets have no delete permission for users
-- (a budget is changed, never deleted, D-28). So every statement below
-- filters by the signed-in user itself, and the function refuses anyone
-- who is not signed in.
create function public.delete_sub_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_parent_id uuid;
begin
  if uid is null then
    raise exception 'delete_sub_category: not signed in' using errcode = '42501';
  end if;

  select c.parent_id into v_parent_id
  from public.categories c
  where c.id = p_id and c.user_id = uid
  for update;
  if not found then
    raise exception 'delete_sub_category: category not found' using errcode = '23503';
  end if;
  if v_parent_id is null then
    raise exception 'delete_sub_category: not a sub-category' using errcode = '23514';
  end if;

  -- A sub-category has its parent's kind, so the moved rows stay valid
  -- (the transactions and recurring_rules triggers check this again).
  update public.transactions set category_id = v_parent_id where category_id = p_id and user_id = uid;
  update public.recurring_rules set category_id = v_parent_id where category_id = p_id and user_id = uid;
  delete from public.budgets where category_id = p_id and user_id = uid;
  delete from public.categories where id = p_id and user_id = uid;
end;
$$;

revoke execute on function public.delete_sub_category(uuid) from public, anon;
grant execute on function public.delete_sub_category(uuid) to authenticated;
