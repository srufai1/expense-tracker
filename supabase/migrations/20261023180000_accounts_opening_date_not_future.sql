-- An opening balance cannot be dated in the future (D-30). The form and the
-- Server Action already refuse it; this makes the database refuse it too,
-- for anyone writing through the Data API directly.
--
-- A CHECK is only evaluated when a row is inserted or updated. A date that
-- was "today or earlier" stays so as time passes, so existing rows never
-- start failing it.
alter table public.accounts
  add constraint accounts_opening_balance_on_not_future
  check (opening_balance_on <= (now() at time zone 'Africa/Accra')::date);
