-- Exchange rates (DESIGN §6.4, M-5, M-6, D-35). Shared reference data, not
-- per user: one USD→GHS rate per day, fetched by the daily job.

create table public.fx_rates (
  -- The provider's own update date for this rate (Accra is UTC+0).
  rate_date date not null,
  base text not null,
  quote text not null,
  -- How many `quote` for 1 `base`, the same 6 decimals as transactions.fx_rate.
  rate numeric(14, 6) not null,
  -- The service name, e.g. open.er-api.com.
  source text not null,
  fetched_at timestamptz not null default now(),

  primary key (rate_date, base, quote),
  constraint fx_rates_currencies_valid check (base in ('GHS', 'USD') and quote in ('GHS', 'USD') and base <> quote),
  constraint fx_rates_rate_positive check (rate > 0),
  constraint fx_rates_source_length check (char_length(source) between 1 and 100)
);

-- Row-Level Security: every signed-in user may read the rates. There is no
-- insert, update or delete policy, so the app can never write them. Only
-- the daily job writes, with the secret key, which bypasses RLS.
alter table public.fx_rates enable row level security;

create policy fx_rates_select_signed_in on public.fx_rates
  for select to authenticated
  using (true);

-- D-28: nothing is exposed automatically, also not to the secret key.
grant select on public.fx_rates to authenticated;
grant select, insert, update on public.fx_rates to service_role;

-- A rate fetched automatically always records which day's rate it was; a
-- rate typed by hand has no date (M-5). GHS already has neither.
alter table public.transactions
  add constraint transactions_auto_rate_dated
  check ((fx_source = 'auto') = (fx_rate_date is not null));
