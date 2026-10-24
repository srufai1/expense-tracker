-- Transfers between the user's own accounts, with an optional fee
-- (DESIGN §6.3, D-06, D-07, D-33).
--
-- A transfer is one row (kind 'transfer'): money leaves `account_id` and
-- arrives in `to_account_id`. A fee is a second row: an expense in Fees &
-- Charges from the same account, whose parent_transaction_id points to the
-- transfer. save_transfer() writes both in one database transaction, so
-- there is never a transfer without its fee or a fee without its transfer.

-- The reference checks from the transactions migration, plus the transfer
-- and fee rules. Still runs with the caller's rights, so Row-Level Security
-- hides other users' rows: anything not yours is "not found".
create or replace function public.transactions_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account record;
  to_account record;
  category record;
  category_key text;
  parent record;
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

  -- This trigger runs before the CHECK constraints, so a malformed row (for
  -- example a transfer without a to-account) is left to them.
  if new.kind = 'transfer' and new.to_account_id is not null then
    -- The amount sent is in the sending account's own currency.
    if new.currency <> account.currency then
      raise exception 'transactions: a transfer is in the currency of the account it leaves'
        using errcode = '23514';
    end if;
    -- Same currency: what arrives is what was sent. Different currencies:
    -- both amounts are recorded as they happened (D-33).
    if to_account.currency = account.currency and new.to_amount_minor <> new.amount_minor then
      raise exception 'transactions: a transfer in one currency receives the amount sent'
        using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null then
    select c.user_id, c.kind, c.system_key into category from public.categories c where c.id = new.category_id;
    if not found or category.user_id <> new.user_id then
      raise exception 'transactions: category not found' using errcode = '23503';
    end if;
    if category.kind <> new.kind then
      raise exception 'transactions: the category kind must match the transaction kind'
        using errcode = '23514';
    end if;
    category_key := category.system_key;
  end if;

  -- A fee belongs to one of the user's own transfers, from the same account,
  -- and is an expense in Fees & Charges (D-07).
  if new.parent_transaction_id is not null then
    select t.kind, t.account_id into parent from public.transactions t where t.id = new.parent_transaction_id;
    if not found then
      raise exception 'transactions: transfer not found' using errcode = '23503';
    end if;
    if parent.kind <> 'transfer' or new.kind <> 'expense' or category_key is distinct from 'fees'
       or parent.account_id <> new.account_id then
      raise exception 'transactions: a fee is a Fees & Charges expense from the account of its transfer'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- D-28: the transfer columns can now be written by the app.
grant insert (to_account_id, to_amount_minor, parent_transaction_id) on public.transactions to authenticated;
grant update (to_account_id, to_amount_minor) on public.transactions to authenticated;

-- Saves a transfer and its fee together: a new one (p_id null, or the id of
-- a deleted transfer being put back by Undo, D-26), or changes to an
-- existing one. The fee is replaced on every save; a fee of 0 or null
-- means "no fee". The amounts in GHS come from the app, which uses the one
-- rounding function (M-4); the CHECK constraints verify them.
-- SECURITY INVOKER (the default): it runs with the caller's rights, so
-- Row-Level Security and every check above still apply.
create function public.save_transfer(
  p_id uuid,
  p_occurred_on date,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_minor bigint,
  p_to_amount_minor bigint,
  p_currency text,
  p_fx_rate numeric,
  p_fx_source text,
  p_fx_rate_date date,
  p_amount_ghs_minor bigint,
  p_fee_minor bigint,
  p_fee_ghs_minor bigint,
  p_note text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  transfer_id uuid := coalesce(p_id, gen_random_uuid());
  fees_category_id uuid;
begin
  if coalesce(p_fee_minor, 0) > 0 then
    select c.id into fees_category_id from public.categories c where c.system_key = 'fees';
    if fees_category_id is null then
      -- First use: create the starter categories, which include Fees & Charges.
      perform public.seed_starter_categories();
      select c.id into fees_category_id from public.categories c where c.system_key = 'fees';
    end if;
  end if;

  if p_id is not null and exists (select 1 from public.transactions t where t.id = p_id) then
    update public.transactions
      set occurred_on = p_occurred_on,
          account_id = p_from_account_id,
          to_account_id = p_to_account_id,
          amount_minor = p_amount_minor,
          to_amount_minor = p_to_amount_minor,
          currency = p_currency,
          fx_rate = p_fx_rate,
          fx_source = p_fx_source,
          fx_rate_date = p_fx_rate_date,
          amount_ghs_minor = p_amount_ghs_minor,
          account_amount_minor = p_amount_minor,
          note = p_note
      where id = p_id and kind = 'transfer';
    if not found then
      raise exception 'transfers: this is not a transfer' using errcode = '23514';
    end if;
    delete from public.transactions t where t.parent_transaction_id = p_id;
  else
    insert into public.transactions (id, kind, occurred_on, account_id, to_account_id, amount_minor,
      to_amount_minor, currency, fx_rate, fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note)
    values (transfer_id, 'transfer', p_occurred_on, p_from_account_id, p_to_account_id, p_amount_minor,
      p_to_amount_minor, p_currency, p_fx_rate, p_fx_source, p_fx_rate_date, p_amount_ghs_minor, p_amount_minor,
      p_note);
  end if;

  if coalesce(p_fee_minor, 0) > 0 then
    insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency,
      fx_rate, fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note, parent_transaction_id)
    values ('expense', p_occurred_on, p_from_account_id, fees_category_id, p_fee_minor, p_currency,
      p_fx_rate, p_fx_source, p_fx_rate_date, p_fee_ghs_minor, p_fee_minor, 'Transfer fee', transfer_id);
  end if;

  return transfer_id;
end;
$$;

revoke execute on function public.save_transfer(uuid, date, uuid, uuid, bigint, bigint, text, numeric, text, date,
  bigint, bigint, bigint, text) from public, anon;
grant execute on function public.save_transfer(uuid, date, uuid, uuid, bigint, bigint, text, numeric, text, date,
  bigint, bigint, bigint, text) to authenticated;

-- Deletes a transfer with its fee (ON DELETE CASCADE) and returns what was
-- deleted, in save_transfer()'s argument names, so Undo can put back
-- exactly that (D-26). Locking the transfer first makes reading the fee and
-- deleting one step: a save in another tab waits, instead of changing the
-- fee in between. null (nothing deleted): not one of the user's transfers.
create function public.delete_transfer(p_id uuid)
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
    'p_note', transfer.note
  );
end;
$$;

revoke execute on function public.delete_transfer(uuid) from public, anon;
grant execute on function public.delete_transfer(uuid) to authenticated;
