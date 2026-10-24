-- Recurring items: salary, rent, subscriptions, regular transfers
-- (DESIGN §6.6, D-11, D-38, D-39). A rule is a template; the daily job
-- creates a transaction for every due date and moves next_run_on forward.

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The template. Same meaning as in transactions.
  kind text not null,
  -- An account or category with recurring items cannot be deleted; the
  -- items must be deleted first (or the account/category archived).
  account_id uuid not null references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  to_account_id uuid references public.accounts (id) on delete restrict,
  amount_minor bigint not null,
  currency text not null,
  note text not null default '',
  -- The schedule.
  frequency text not null,
  weekday smallint,
  day_of_month smallint,
  starts_on date not null,
  ends_on date,
  -- The next date to create. Set by the app when the rule is saved,
  -- skipped or resumed, and by the daily job after it creates items.
  next_run_on date not null,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_rules_kind_valid check (kind in ('expense', 'income', 'transfer')),
  constraint recurring_rules_currency_valid check (currency in ('GHS', 'USD')),
  constraint recurring_rules_amount_range check (amount_minor between 1 and 99999999999),
  constraint recurring_rules_transfer_shape check (
    (kind = 'transfer' and to_account_id is not null and category_id is null)
    or (kind <> 'transfer' and to_account_id is null and category_id is not null)
  ),
  constraint recurring_rules_two_accounts check (to_account_id <> account_id),
  constraint recurring_rules_schedule check (
    (frequency = 'weekly' and weekday between 1 and 7 and day_of_month is null)
    or (frequency = 'monthly' and day_of_month between 1 and 31 and weekday is null)
  ),
  constraint recurring_rules_dates check (ends_on is null or ends_on >= starts_on),
  constraint recurring_rules_next_run_from_start check (next_run_on >= starts_on),
  constraint recurring_rules_note_length check (char_length(note) <= 200),
  constraint recurring_rules_note_trimmed check (note = btrim(note))
);

create index recurring_rules_user_id_idx on public.recurring_rules (user_id);
create index recurring_rules_due_idx on public.recurring_rules (next_run_on) where not paused;
create index recurring_rules_account_id_idx on public.recurring_rules (account_id);
create index recurring_rules_to_account_id_idx on public.recurring_rules (to_account_id);
create index recurring_rules_category_id_idx on public.recurring_rules (category_id);

create trigger recurring_rules_set_updated_at
  before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- The same ownership and kind checks as transactions_check_refs, for the
-- template. Runs with the caller's rights: anything not yours is "not found".
create function public.recurring_rules_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account record;
  to_account record;
  category record;
begin
  select a.user_id, a.currency into account from public.accounts a where a.id = new.account_id;
  if not found or account.user_id <> new.user_id then
    raise exception 'recurring_rules: account not found' using errcode = '23503';
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
  return new;
end;
$$;

create trigger recurring_rules_check_refs
  before insert or update on public.recurring_rules
  for each row execute function public.recurring_rules_check_refs();

alter table public.recurring_rules enable row level security;

create policy recurring_rules_select_own on public.recurring_rules
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy recurring_rules_insert_own on public.recurring_rules
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy recurring_rules_update_own on public.recurring_rules
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recurring_rules_delete_own on public.recurring_rules
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- D-28: the columns the app writes.
grant select, delete on public.recurring_rules to authenticated;
grant insert (kind, account_id, category_id, to_account_id, amount_minor, currency, note, frequency, weekday,
              day_of_month, starts_on, ends_on, next_run_on, paused)
  on public.recurring_rules to authenticated;
grant update (kind, account_id, category_id, to_account_id, amount_minor, currency, note, frequency, weekday,
              day_of_month, starts_on, ends_on, next_run_on, paused)
  on public.recurring_rules to authenticated;

-- A transaction remembers the rule that created it. Deleting the rule keeps
-- the transactions (they are history) and only clears the link; the
-- occurrence date stays as a record of which repeat it was.
alter table public.transactions drop constraint transactions_occurrence_pair;
alter table public.transactions
  add constraint transactions_occurrence_dated check (recurring_rule_id is null or occurrence_date is not null);
alter table public.transactions
  add constraint transactions_recurring_rule_id_fkey
  foreign key (recurring_rule_id) references public.recurring_rules (id) on delete set null (recurring_rule_id);

-- The daily job (secret key, service_role) reads the rules and the data it
-- needs, creates the transactions, and moves next_run_on forward. It sets
-- user_id itself: it has no signed-in user. Row-Level Security does not
-- apply to it, but every CHECK and trigger above still does.
grant select on public.recurring_rules, public.accounts, public.categories to service_role;
grant update (next_run_on) on public.recurring_rules to service_role;
grant select on public.transactions to service_role;
grant insert (user_id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source,
              fx_rate_date, amount_ghs_minor, account_amount_minor, to_account_id, to_amount_minor,
              recurring_rule_id, occurrence_date, note)
  on public.transactions to service_role;

-- Codex review on PR #8 ---------------------------------------------------

-- A transaction may only point to the user's own recurring item. Without
-- this, another user could take (rule, date) and stop the item being
-- created that day. Runs with the caller's rights: a rule that is not
-- yours is "not found". (The daily job bypasses RLS and is checked by
-- user_id.)
create function public.transactions_check_recurring()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recurring_rule_id is not null and not exists (
    select 1 from public.recurring_rules r where r.id = new.recurring_rule_id and r.user_id = new.user_id
  ) then
    raise exception 'transactions: recurring item not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger transactions_check_recurring
  before insert or update of recurring_rule_id on public.transactions
  for each row execute function public.transactions_check_recurring();

-- Undo (D-26) puts a created transaction back with its link, so the daily
-- job still sees that date as done and never creates it twice.
grant insert (recurring_rule_id, occurrence_date) on public.transactions to authenticated;
grant update (recurring_rule_id, occurrence_date) on public.transactions to authenticated;

-- D-38 stays true after account edits: an account used by a recurring
-- transfer keeps its currency, like one with transactions. (An expense or
-- income rule converts, M-7 and D-36, so it does not lock the currency.)
create or replace function public.accounts_lock_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency <> old.currency and (
    exists (select 1 from public.transactions t where t.account_id = old.id or t.to_account_id = old.id)
    or exists (
      select 1 from public.recurring_rules r
      where r.kind = 'transfer' and (r.account_id = old.id or r.to_account_id = old.id)
    )
  ) then
    raise exception 'accounts: the currency of an account with transactions or recurring transfers cannot change'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- delete_transfer() also returns the recurring link, so Undo can put a
-- created transfer back with it.
create or replace function public.delete_transfer(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  transfer public.transactions;
  fee public.transactions;
begin
  select * into transfer from public.transactions t where t.id = p_id and t.kind = 'transfer' for update;
  if not found then
    return null;
  end if;
  select * into fee from public.transactions t where t.parent_transaction_id = p_id for update;
  delete from public.transactions t where t.id = p_id;

  return jsonb_build_object(
    'p_id', transfer.id,
    'p_occurred_on', transfer.occurred_on,
    'p_from_account_id', transfer.account_id,
    'p_to_account_id', transfer.to_account_id,
    'p_amount_minor', transfer.amount_minor,
    'p_to_amount_minor', transfer.to_amount_minor,
    'p_currency', transfer.currency,
    'p_fx_rate', transfer.fx_rate,
    'p_fx_source', transfer.fx_source,
    'p_fx_rate_date', transfer.fx_rate_date,
    'p_amount_ghs_minor', transfer.amount_ghs_minor,
    'p_fee_minor', fee.amount_minor,
    'p_fee_ghs_minor', fee.amount_ghs_minor,
    'p_note', transfer.note,
    'recurring_rule_id', transfer.recurring_rule_id,
    'occurrence_date', transfer.occurrence_date
  );
end;
$$;
