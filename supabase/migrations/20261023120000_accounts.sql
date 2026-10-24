-- Accounts: where money sits — cash, bank, mobile money, card (DESIGN §6.1).
-- The balance is NOT stored here. It is calculated from the opening
-- balance and the transactions on or after opening_balance_on (M-8, D-30).

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null,
  currency text not null,
  -- Whole pesewas or cents (M-1). May be negative: an overdraft (D-29).
  opening_balance_minor bigint not null default 0,
  -- The day the opening balance was true. Accra is UTC+0 all year.
  opening_balance_on date not null default (now() at time zone 'Africa/Accra')::date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounts_name_length check (char_length(name) between 1 and 60),
  constraint accounts_name_trimmed check (name = btrim(name)),
  constraint accounts_type_valid check (type in ('cash', 'bank', 'mobile_money', 'card')),
  constraint accounts_currency_valid check (currency in ('GHS', 'USD')),
  -- Same limit as MAX_AMOUNT_MINOR in src/lib/money.ts: 999,999,999.99.
  constraint accounts_opening_balance_range
    check (opening_balance_minor between -99999999999 and 99999999999)
);

-- One account name per user, ignoring upper and lower case
-- ("Cash" and "cash" would be confusing in a list).
create unique index accounts_user_id_name_key on public.accounts (user_id, lower(name));

-- Keeps updated_at correct on every change. Shared by later tables.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- Row-Level Security: a signed-in user only ever sees and changes their own
-- accounts. One policy per action, so each rule is easy to read.
alter table public.accounts enable row level security;

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy accounts_insert_own on public.accounts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy accounts_update_own on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy accounts_delete_own on public.accounts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- D-28: new tables are not exposed automatically. Open this one to
-- signed-in users only, and only the columns the app writes: id, user_id
-- and the timestamps are always set by the database, never by the app.
grant select, delete on public.accounts to authenticated;
grant insert (name, type, currency, opening_balance_minor, opening_balance_on)
  on public.accounts to authenticated;
grant update (name, type, currency, opening_balance_minor, opening_balance_on, archived_at)
  on public.accounts to authenticated;
