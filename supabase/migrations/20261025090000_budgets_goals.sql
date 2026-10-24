-- Budgets (DESIGN §6.5, D-16, D-25) and savings goals (§6.7, D-24).

-- A monthly budget in GHS for an expense category. The budget for a month is
-- the latest row whose effective_from is on or before that month, so
-- changing it in November does not rewrite October. Rows are never deleted:
-- "no budget from now on" is an amount of 0 from that month.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A category with a budget cannot be deleted, only archived (D-32).
  category_id uuid not null references public.categories (id) on delete restrict,
  effective_from date not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budgets_first_of_month check (extract(day from effective_from) = 1),
  constraint budgets_amount_range check (amount_minor between 0 and 99999999999),
  constraint budgets_category_month_key unique (category_id, effective_from)
);

create index budgets_user_id_idx on public.budgets (user_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- The budget of a category for a month: the latest row on or before it.
-- 0 when there is none. Runs with the caller's rights (RLS applies).
create function public.budget_for_month(p_category_id uuid, p_month date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select b.amount_minor from public.budgets b
    where b.category_id = p_category_id and b.effective_from <= p_month
    order by b.effective_from desc
    limit 1
  ), 0)
$$;

-- D-25: for every month, the sub-category budgets of a parent may not add up
-- to more than the parent's budget (a sub-category budget therefore needs a
-- parent budget). Checks every month from p_from on (all months when p_from
-- is null) in which a budget of the parent or its children changes, and
-- returns the first month that breaks the rule, or null. Runs with the
-- caller's rights (RLS applies).
create function public.budgets_first_over_month(p_top_id uuid, p_from date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  month date;
begin
  for month in
    select distinct b.effective_from from public.budgets b
    join public.categories c on c.id = b.category_id
    where (c.id = p_top_id or c.parent_id = p_top_id)
      and (p_from is null or b.effective_from >= p_from)
    order by 1
  loop
    if (select coalesce(sum(public.budget_for_month(c.id, month)), 0)
          from public.categories c where c.parent_id = p_top_id)
       > public.budget_for_month(p_top_id, month) then
      return month;
    end if;
  end loop;
  return null;
end;
$$;

-- After a budget is written: the category must be the user's own expense
-- category, and D-25 must hold from the changed month on.
create function public.budgets_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  category record;
  bad_month date;
begin
  select c.user_id, c.kind, c.parent_id into category from public.categories c where c.id = new.category_id;
  if not found or category.user_id <> new.user_id then
    raise exception 'budgets: category not found' using errcode = '23503';
  end if;
  if category.kind <> 'expense' then
    raise exception 'budgets: only expense categories have budgets' using errcode = '23514';
  end if;

  -- The parent whose children are checked: this category's parent, or the
  -- category itself when it is top level. The new row's own month is in
  -- the list, because the row is already written.
  bad_month := public.budgets_first_over_month(coalesce(category.parent_id, new.category_id), new.effective_from);
  if bad_month is not null then
    raise exception 'budgets: the sub-category budgets add up to more than the category budget (%)',
      to_char(bad_month, 'YYYY-MM') using errcode = '23514';
  end if;
  return null;
end;
$$;

-- AFTER the row is written, so the check sees the new values.
create constraint trigger budgets_check
  after insert or update on public.budgets
  for each row execute function public.budgets_check();

-- D-25 also holds when a category moves to another parent: its budgets now
-- count towards the new parent. (Leaving a parent only lowers that
-- parent's total, so only the new parent is checked.)
create function public.categories_check_budgets()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bad_month date;
begin
  if new.parent_id is not null then
    bad_month := public.budgets_first_over_month(new.parent_id, null);
    if bad_month is not null then
      raise exception 'categories: moving this category would make the sub-category budgets add up to more than the category budget (%)',
        to_char(bad_month, 'YYYY-MM') using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger categories_check_budgets
  after update of parent_id on public.categories
  for each row
  when (new.parent_id is distinct from old.parent_id)
  execute function public.categories_check_budgets();

alter table public.budgets enable row level security;

create policy budgets_select_own on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert_own on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update_own on public.budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- D-28. No delete: history stays; a budget ends with an amount of 0.
grant select on public.budgets to authenticated;
grant insert (category_id, effective_from, amount_minor) on public.budgets to authenticated;
grant update (amount_minor) on public.budgets to authenticated;
grant execute on function public.budget_for_month(uuid, date) to authenticated;
revoke execute on function public.budget_for_month(uuid, date) from public, anon;
grant execute on function public.budgets_first_over_month(uuid, date) to authenticated;
revoke execute on function public.budgets_first_over_month(uuid, date) from public, anon;

-- Savings goals: a label (D-24). The money stays in whatever account it is
-- in; a contribution changes no balance and no spending total.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_minor bigint not null,
  target_date date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_name_length check (char_length(name) between 1 and 60),
  constraint goals_name_trimmed check (name = btrim(name)),
  constraint goals_target_range check (target_minor between 1 and 99999999999)
);

create unique index goals_user_name_key on public.goals (user_id, lower(name));

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A goal with contributions cannot be deleted, only archived.
  goal_id uuid not null references public.goals (id) on delete restrict,
  occurred_on date not null,
  -- Negative: money taken back out of the goal.
  amount_minor bigint not null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint goal_contributions_amount_range
    check (amount_minor <> 0 and amount_minor between -99999999999 and 99999999999),
  constraint goal_contributions_note_length check (char_length(note) <= 200),
  constraint goal_contributions_note_trimmed check (note = btrim(note))
);

create index goal_contributions_goal_id_idx on public.goal_contributions (goal_id, occurred_on);

-- A contribution belongs to one of the user's own goals.
create function public.goal_contributions_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id) then
    raise exception 'goal_contributions: goal not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger goal_contributions_check
  before insert or update on public.goal_contributions
  for each row execute function public.goal_contributions_check();

alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy goals_select_own on public.goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert_own on public.goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update_own on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy goals_delete_own on public.goals
  for delete to authenticated using (user_id = (select auth.uid()));

create policy goal_contributions_select_own on public.goal_contributions
  for select to authenticated using (user_id = (select auth.uid()));
create policy goal_contributions_insert_own on public.goal_contributions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy goal_contributions_delete_own on public.goal_contributions
  for delete to authenticated using (user_id = (select auth.uid()));

-- D-28.
grant select, delete on public.goals to authenticated;
grant insert (name, target_minor, target_date) on public.goals to authenticated;
grant update (name, target_minor, target_date, archived_at) on public.goals to authenticated;
grant select, delete on public.goal_contributions to authenticated;
grant insert (goal_id, occurred_on, amount_minor, note) on public.goal_contributions to authenticated;
