-- Transactions: every expense, income and transfer (DESIGN §6.3).
--
-- The full shape is created now, so later build steps do not need to change
-- this table. Columns used by later steps (transfers, recurring, receipts)
-- are not yet granted to the app, so nothing can write them until then.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  -- The day it happened, in Accra.
  occurred_on date not null,
  -- For a transfer: the account the money comes from. An account with
  -- transactions cannot be deleted, only archived.
  account_id uuid not null references public.accounts (id) on delete restrict,
  -- Required for expense and income, empty for a transfer. A category with
  -- transactions cannot be deleted, only archived (D-32).
  category_id uuid references public.categories (id) on delete restrict,
  -- The original amount, as on the receipt (M-1, M-2). Whole pesewas/cents.
  amount_minor bigint not null,
  currency text not null,
  -- GHS for 1 unit of `currency` (M-3), stored with the row (M-2).
  fx_rate numeric(14, 6) not null default 1,
  fx_source text not null default 'none',
  fx_rate_date date,
  -- The GHS value, frozen when saved (M-2). Reports use this.
  amount_ghs_minor bigint not null,
  -- What leaves (or enters) the account, in the account's currency (M-7).
  account_amount_minor bigint not null,
  -- Transfers only (build step 6).
  to_account_id uuid references public.accounts (id) on delete restrict,
  to_amount_minor bigint,
  -- A transfer fee points to its transfer; deleting the transfer deletes it.
  parent_transaction_id uuid references public.transactions (id) on delete cascade,
  -- Set by the recurring job (build step 7). The foreign key is added there.
  recurring_rule_id uuid,
  occurrence_date date,
  note text not null default '',
  -- Path in the private receipts bucket (build step 13).
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_kind_valid check (kind in ('expense', 'income', 'transfer')),
  constraint transactions_currency_valid check (currency in ('GHS', 'USD')),
  -- Same limit as MAX_AMOUNT_MINOR in src/lib/money.ts: 999,999,999.99.
  constraint transactions_amount_range check (amount_minor between 1 and 99999999999),
  constraint transactions_account_amount_range check (account_amount_minor between 1 and 99999999999),
  constraint transactions_to_amount_range check (to_amount_minor between 1 and 99999999999),
  constraint transactions_fx_rate_positive check (fx_rate > 0),
  constraint transactions_fx_source_valid check (fx_source in ('none', 'auto', 'manual')),
  -- GHS needs no rate (M-3); any other currency needs a real one.
  constraint transactions_ghs_rate check (
    (currency = 'GHS' and fx_rate = 1 and fx_source = 'none' and fx_rate_date is null)
    or (currency <> 'GHS' and fx_source <> 'none')
  ),
  -- M-4: GHS value = amount × rate, rounded half away from zero. Postgres
  -- round() on numeric rounds half away from zero, like convertToGhs().
  constraint transactions_amount_ghs check (amount_ghs_minor = round(amount_minor * fx_rate)),
  -- Transfer ⇔ a to-account and an amount received, and no category.
  constraint transactions_transfer_shape check (
    (kind = 'transfer' and to_account_id is not null and to_amount_minor is not null and category_id is null)
    or (kind <> 'transfer' and to_account_id is null and to_amount_minor is null and category_id is not null)
  ),
  constraint transactions_transfer_two_accounts check (to_account_id <> account_id),
  constraint transactions_occurrence_pair check ((recurring_rule_id is null) = (occurrence_date is null)),
  constraint transactions_note_length check (char_length(note) <= 200),
  constraint transactions_note_trimmed check (note = btrim(note))
);

-- A recurring item can never be created twice (§6.6). NULLs never clash.
create unique index transactions_recurring_occurrence_key
  on public.transactions (recurring_rule_id, occurrence_date);

-- The Activity list and reports read by user and date.
create index transactions_user_occurred_on_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_to_account_id_idx on public.transactions (to_account_id);
create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_parent_transaction_id_idx on public.transactions (parent_transaction_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Checks that need another table. The function runs with the caller's
-- rights, so Row-Level Security hides other users' rows: an account or
-- category that is not yours is "not found".
create function public.transactions_check_refs()
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
    raise exception 'transactions: account not found' using errcode = '23503';
  end if;
  -- M-7: in the account's own currency, the account amount is the amount.
  if account.currency = new.currency and new.account_amount_minor <> new.amount_minor then
    raise exception 'transactions: the account amount must equal the amount in the same currency'
      using errcode = '23514';
  end if;

  if new.to_account_id is not null then
    select a.user_id, a.currency into to_account from public.accounts a where a.id = new.to_account_id;
    if not found or to_account.user_id <> new.user_id then
      raise exception 'transactions: account not found' using errcode = '23503';
    end if;
  end if;

  if new.category_id is not null then
    select c.user_id, c.kind into category from public.categories c where c.id = new.category_id;
    if not found or category.user_id <> new.user_id then
      raise exception 'transactions: category not found' using errcode = '23503';
    end if;
    if category.kind <> new.kind then
      raise exception 'transactions: the category kind must match the transaction kind'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_check_refs
  before insert or update on public.transactions
  for each row execute function public.transactions_check_refs();

-- An account's currency cannot change once it has transactions: their
-- account amounts are in the old currency, and the balance would be wrong.
create function public.accounts_lock_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency <> old.currency and exists (
    select 1 from public.transactions t where t.account_id = old.id or t.to_account_id = old.id
  ) then
    raise exception 'accounts: the currency of an account with transactions cannot change'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger accounts_lock_currency
  before update of currency on public.accounts
  for each row execute function public.accounts_lock_currency();

alter table public.transactions enable row level security;

create policy transactions_select_own on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy transactions_insert_own on public.transactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy transactions_update_own on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_delete_own on public.transactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- D-28: only the columns the app writes in this step. `id` can be given on
-- insert so that Undo (D-26) puts a deleted transaction back as it was.
-- Transfer, fee, recurring and receipt columns are granted in their steps.
grant select, delete on public.transactions to authenticated;
grant insert (id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
              fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note)
  on public.transactions to authenticated;
grant update (kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
              fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note)
  on public.transactions to authenticated;

-- Account balances, calculated on every read and never stored (M-8):
-- opening balance + income − expenses − transfers out + transfers in,
-- counting only transactions on or after the opening date (D-30).
-- security_invoker: the view uses the caller's Row-Level Security.
create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  (a.opening_balance_minor + coalesce(moves.change_minor, 0))::bigint as balance_minor,
  -- Any transaction at all, also before the opening date: then the
  -- account's currency is locked (see accounts_lock_currency).
  exists (
    select 1 from public.transactions t where t.account_id = a.id or t.to_account_id = a.id
  ) as has_transactions
from public.accounts a
left join lateral (
  select sum(
    case
      when t.account_id = a.id and t.kind = 'income' then t.account_amount_minor
      when t.account_id = a.id then -t.account_amount_minor
      else t.to_amount_minor
    end
  ) as change_minor
  from public.transactions t
  where (t.account_id = a.id or t.to_account_id = a.id)
    and t.occurred_on >= a.opening_balance_on
) moves on true;

grant select on public.account_balances to authenticated;
