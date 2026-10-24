-- Categories for expenses and income, two levels: Food → Groceries
-- (DESIGN §6.2, D-08, D-09). "Fees & Charges" is a system category that
-- transfer fees always use (D-07); it can be neither deleted nor archived.
-- A category that is used can only be archived, never deleted (D-32): later
-- tables (transactions, budgets) refer to it with ON DELETE RESTRICT.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  -- null = top level. Deleting a parent that still has sub-categories is
  -- refused (RESTRICT): they must be deleted or moved first.
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null,
  -- 'fees' marks Fees & Charges. Only seed_starter_categories() sets it.
  system_key text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_kind_valid check (kind in ('expense', 'income')),
  constraint categories_name_length check (char_length(name) between 1 and 40),
  constraint categories_name_trimmed check (name = btrim(name)),
  constraint categories_system_key_valid check (system_key is null or system_key = 'fees'),
  constraint categories_system_not_archived check (system_key is null or archived_at is null),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

-- A name is unique among the categories of the same kind with the same
-- parent, ignoring case. NULLS NOT DISTINCT makes this hold for top level too.
create unique index categories_user_kind_parent_name_key
  on public.categories (user_id, kind, parent_id, lower(name)) nulls not distinct;

-- Each system category exists once per user.
create unique index categories_user_system_key_key
  on public.categories (user_id, system_key) where system_key is not null;

create index categories_parent_id_idx on public.categories (parent_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Two levels only, and a sub-category must match its parent.
-- Runs as the calling user, so Row-Level Security hides other users'
-- categories: a parent id that is not yours is "not found".
create function public.categories_check_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent record;
begin
  if new.parent_id is not null then
    select c.user_id, c.kind, c.parent_id into parent
      from public.categories c
      where c.id = new.parent_id;
    if not found or parent.user_id <> new.user_id then
      raise exception 'categories: parent category not found' using errcode = '23503';
    end if;
    if parent.parent_id is not null then
      raise exception 'categories: only two levels are allowed' using errcode = '23514';
    end if;
    if parent.kind <> new.kind then
      raise exception 'categories: a sub-category must have the same kind as its parent'
        using errcode = '23514';
    end if;
    if new.system_key is not null then
      raise exception 'categories: a system category stays at the top level' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'categories: a category with sub-categories cannot become a sub-category'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_check_parent
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_check_parent();

-- The system category can never be deleted (D-07, D-32).
create function public.categories_protect_system()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key is not null then
    raise exception 'categories: % is a system category and cannot be deleted', old.name
      using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger categories_protect_system
  before delete on public.categories
  for each row execute function public.categories_protect_system();

alter table public.categories enable row level security;

create policy categories_select_own on public.categories
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy categories_delete_own on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- D-28: only the columns the app writes. kind is fixed once created, and
-- system_key is never written by the app.
grant select, delete on public.categories to authenticated;
grant insert (kind, parent_id, name, sort_order) on public.categories to authenticated;
grant update (parent_id, name, sort_order, archived_at) on public.categories to authenticated;

-- The starter list (DESIGN §6.2), created once for the signed-in user. Safe to
-- call again: it does nothing when the user already has categories, except
-- making sure Fees & Charges exists.
-- SECURITY DEFINER because it sets system_key, which the app cannot write;
-- it only ever writes rows for auth.uid().
create function public.seed_starter_categories()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  starter jsonb := '[
    ["Food", ["Groceries", "Eating out"]],
    ["Transport", ["Trotro & taxi", "Fuel", "Ride-hailing"]],
    ["Housing", ["Rent", "Repairs"]],
    ["Utilities", ["Electricity", "Water", "Gas"]],
    ["Data & Airtime", []],
    ["Family support", []],
    ["Church & Tithe", []],
    ["Health", []],
    ["Personal care", []],
    ["Clothing", []],
    ["Entertainment", ["Streaming", "Outings"]],
    ["Education", []],
    ["Gifts given", []],
    ["Other", []]
  ]';
  item jsonb;
  child text;
  new_parent_id uuid;
  pos integer := 0;
begin
  if uid is null then
    raise exception 'seed_starter_categories: not signed in' using errcode = '42501';
  end if;

  if not exists (select 1 from public.categories where user_id = uid) then
    for item in select value from jsonb_array_elements(starter) loop
      pos := pos + 10;
      insert into public.categories (user_id, kind, name, sort_order)
        values (uid, 'expense', item ->> 0, pos)
        returning id into new_parent_id;
      for child in select value from jsonb_array_elements_text(item -> 1) loop
        insert into public.categories (user_id, kind, parent_id, name)
          values (uid, 'expense', new_parent_id, child);
      end loop;
    end loop;
    insert into public.categories (user_id, kind, name, sort_order)
      values (uid, 'income', 'Salary', 10), (uid, 'income', 'Other income', 20);
  end if;

  insert into public.categories (user_id, kind, name, system_key, sort_order)
    values (uid, 'expense', 'Fees & Charges', 'fees', 1000)
    -- Already there (or a clashing name): nothing to do.
    on conflict do nothing;
end;
$$;

revoke execute on function public.seed_starter_categories() from public, anon;
grant execute on function public.seed_starter_categories() to authenticated;
