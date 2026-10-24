-- Recurring goal contributions (DESIGN §6.6 goal_id, §6.7, D-40): "GHS 180
-- to Emergency fund every Monday". A rule of kind 'goal_contribution'
-- points to a goal and has no account or category: a goal is a label, and
-- the money stays in its account (D-24). The daily job adds a contribution
-- for each date instead of a transaction.

alter table public.recurring_rules
  -- A goal with recurring items cannot be deleted; the items must be
  -- deleted first (or the goal archived).
  add column goal_id uuid references public.goals (id) on delete restrict,
  alter column account_id drop not null;

create index recurring_rules_goal_id_idx on public.recurring_rules (goal_id);

alter table public.recurring_rules drop constraint recurring_rules_kind_valid;
alter table public.recurring_rules
  add constraint recurring_rules_kind_valid check (kind in ('expense', 'income', 'transfer', 'goal_contribution'));

-- Which columns each kind uses. A goal contribution is in GHS, like the
-- goal's target.
alter table public.recurring_rules drop constraint recurring_rules_transfer_shape;
alter table public.recurring_rules add constraint recurring_rules_shape check (
  case kind
    when 'transfer' then
      account_id is not null and to_account_id is not null and category_id is null and goal_id is null
    when 'goal_contribution' then
      goal_id is not null and currency = 'GHS'
      and account_id is null and to_account_id is null and category_id is null
    else
      account_id is not null and category_id is not null and to_account_id is null and goal_id is null
  end
);

-- The ownership checks, now also for the goal. Runs with the caller's
-- rights: anything not yours is "not found".
create or replace function public.recurring_rules_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account record;
  to_account record;
  category record;
begin
  if new.account_id is not null then
    select a.user_id, a.currency into account from public.accounts a where a.id = new.account_id;
    if not found or account.user_id <> new.user_id then
      raise exception 'recurring_rules: account not found' using errcode = '23503';
    end if;
  end if;

  if new.to_account_id is not null then
    select a.user_id, a.currency into to_account from public.accounts a where a.id = new.to_account_id;
    if not found or to_account.user_id <> new.user_id then
      raise exception 'recurring_rules: account not found' using errcode = '23503';
    end if;
    -- D-38: a recurring transfer stays in one currency, the accounts' own.
    if new.kind = 'transfer' and (to_account.currency <> account.currency or new.currency <> account.currency) then
      raise exception 'recurring_rules: a recurring transfer is between accounts in one currency'
        using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null then
    select c.user_id, c.kind into category from public.categories c where c.id = new.category_id;
    if not found or category.user_id <> new.user_id then
      raise exception 'recurring_rules: category not found' using errcode = '23503';
    end if;
    if category.kind <> new.kind then
      raise exception 'recurring_rules: the category kind must match the kind'
        using errcode = '23514';
    end if;
  end if;

  if new.goal_id is not null
     and not exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id) then
    raise exception 'recurring_rules: goal not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

grant insert (goal_id) on public.recurring_rules to authenticated;
grant update (goal_id) on public.recurring_rules to authenticated;

-- A contribution remembers the rule that created it, like a transaction.
-- Deleting the rule keeps the contributions (history) and clears the link.
alter table public.goal_contributions
  add column recurring_rule_id uuid,
  add column occurrence_date date,
  add constraint goal_contributions_recurring_rule_id_fkey
    foreign key (recurring_rule_id) references public.recurring_rules (id) on delete set null (recurring_rule_id),
  add constraint goal_contributions_occurrence_dated
    check (recurring_rule_id is null or occurrence_date is not null),
  -- Running the daily job twice never adds a contribution twice.
  add constraint goal_contributions_occurrence_key unique (recurring_rule_id, occurrence_date);

-- A contribution belongs to one of the user's own goals, and may only point
-- to the user's own recurring item (otherwise another user could take
-- (rule, date) and stop the contribution being added that day).
create or replace function public.goal_contributions_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id) then
    raise exception 'goal_contributions: goal not found' using errcode = '23503';
  end if;
  if new.recurring_rule_id is not null and not exists (
    select 1 from public.recurring_rules r where r.id = new.recurring_rule_id and r.user_id = new.user_id
  ) then
    raise exception 'goal_contributions: recurring item not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- The daily job (service_role) reads the goals (an archived goal gets no
-- new contributions, D-40) and adds the contributions.
grant select on public.goals to service_role;
grant select on public.goal_contributions to service_role;
grant insert (user_id, goal_id, occurred_on, amount_minor, note, recurring_rule_id, occurrence_date)
  on public.goal_contributions to service_role;
