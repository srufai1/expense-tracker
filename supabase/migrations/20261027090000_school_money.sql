-- School money (D-54): money the developer collects and holds for the school
-- and the teachers. It sits in a real account (usually Cash), so the
-- account's balance includes it, but it is not the developer's income or
-- spending: reports read `transactions` only, and these tables are not
-- transactions. Only the developer's own share becomes an income
-- transaction (in the "School money" category).
--
-- This migration: settings, Morning classes (days, weekly settlement,
-- sharers) and spending from the savings funds. Fees (D-55) and past
-- questions books (D-56) follow in their own migrations.

-- Where school money is kept, and the income category for the developer's
-- own share. One row per user, made on the School money page.
create table public.school_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  income_category_id uuid not null references public.categories (id),
  -- Past questions books (D-56): per book given out.
  book_transport_minor bigint not null default 500,
  book_mine_minor bigint not null default 2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_settings_book_transport_range check (book_transport_minor between 0 and 99999999999),
  constraint school_settings_book_mine_range check (book_mine_minor between 0 and 99999999999)
);

create trigger school_settings_set_updated_at
  before update on public.school_settings
  for each row execute function public.set_updated_at();

-- The account must be the user's own GHS account; the category the user's
-- own income category.
create function public.school_settings_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id and a.currency = 'GHS'
  ) then
    raise exception 'school_settings: choose one of your GHS accounts' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.categories c where c.id = new.income_category_id and c.user_id = new.user_id and c.kind = 'income'
  ) then
    raise exception 'school_settings: income category not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger school_settings_check
  before insert or update on public.school_settings
  for each row execute function public.school_settings_check();

-- Rows that move money fill in the school money account when it is not
-- given, so they keep the account they used even if the setting changes.
create function public.school_fill_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is null then
    select s.account_id into new.account_id from public.school_settings s where s.user_id = new.user_id;
    if not found then
      raise exception 'school money: set up School money first' using errcode = '23503';
    end if;
  elsif not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id and a.currency = 'GHS'
  ) then
    raise exception 'school money: account not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- The Monday of a date's week (Saturday and Sunday belong to the week that
-- just ended).
create function public.school_monday(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_day - (extract(isodow from p_day)::int - 1)
$$;

-- People who share the teachers' money. "Me" (is_me) is the developer: their
-- share becomes income. Others come and go; old weeks keep the names.
create table public.mc_sharers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_me boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint mc_sharers_name_length check (char_length(name) between 1 and 40),
  constraint mc_sharers_name_trimmed check (name = btrim(name))
);

create unique index mc_sharers_user_name_key on public.mc_sharers (user_id, lower(name));
create unique index mc_sharers_one_me on public.mc_sharers (user_id) where is_me;

-- One school day. A class day has, per class (JHS 1–3), the students who
-- paid the full fee and the money from those who paid less. A day without
-- class has a reason instead. The fee and the school's part are stored with
-- the day, so a later change of fee never changes an old week.
create table public.mc_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  account_id uuid references public.accounts (id),
  no_class boolean not null default false,
  reason text,
  note text not null default '',
  full_1 integer not null default 0,
  full_2 integer not null default 0,
  full_3 integer not null default 0,
  less_1_minor bigint not null default 0,
  less_2_minor bigint not null default 0,
  less_3_minor bigint not null default 0,
  fee_minor bigint not null default 300,
  school_minor bigint not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mc_days_weekday check (extract(isodow from day) between 1 and 5),
  constraint mc_days_full_range check (full_1 between 0 and 500 and full_2 between 0 and 500 and full_3 between 0 and 500),
  constraint mc_days_less_range check (
    less_1_minor between 0 and 99999999999 and less_2_minor between 0 and 99999999999 and less_3_minor between 0 and 99999999999
  ),
  constraint mc_days_fee_range check (fee_minor between 1 and 99999999999 and school_minor between 0 and fee_minor),
  constraint mc_days_reason_valid check (reason in ('holiday', 'exams', 'other')),
  -- No class ⇔ a reason, and nothing collected.
  constraint mc_days_shape check (
    (no_class and reason is not null and full_1 = 0 and full_2 = 0 and full_3 = 0
      and less_1_minor = 0 and less_2_minor = 0 and less_3_minor = 0)
    or (not no_class and reason is null)
  ),
  constraint mc_days_note_length check (char_length(note) <= 100),
  constraint mc_days_note_trimmed check (note = btrim(note))
);

create unique index mc_days_user_day_key on public.mc_days (user_id, day);

create trigger mc_days_set_updated_at
  before update on public.mc_days
  for each row execute function public.set_updated_at();

create trigger mc_days_fill_account
  before insert or update on public.mc_days
  for each row execute function public.school_fill_account();

-- A settled week: the numbers worked out on the day it was settled
-- (src/lib/school/morning.ts), frozen. Written only by mc_settle().
create table public.mc_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  settled_on date not null,
  account_id uuid not null references public.accounts (id),
  class_days integer not null,
  collected_minor bigint not null,
  school_minor bigint not null,
  savings_rule text not null,
  savings_day date,
  -- Saved this week, including the leftover pesewas.
  savings_minor bigint not null,
  leftover_minor bigint not null,
  markers_minor bigint not null,
  assistant_minor bigint not null,
  each_minor bigint not null,
  created_at timestamptz not null default now(),

  constraint mc_weeks_monday check (extract(isodow from week_start) = 1),
  constraint mc_weeks_class_days check (class_days between 1 and 5),
  constraint mc_weeks_savings_rule_valid check (savings_rule in ('all', 'half', 'none')),
  constraint mc_weeks_amounts check (
    collected_minor >= 0 and school_minor >= 0 and savings_minor >= 0 and leftover_minor >= 0
    and markers_minor >= 0 and assistant_minor >= 0 and each_minor >= 0
  )
);

create unique index mc_weeks_user_week_key on public.mc_weeks (user_id, week_start);

-- Each person's share of a settled week. The developer's own share is paid
-- at once, as an income transaction; others are ticked when paid.
create table public.mc_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_id uuid not null references public.mc_weeks (id) on delete cascade,
  sharer_id uuid references public.mc_sharers (id) on delete set null,
  name text not null,
  is_me boolean not null default false,
  amount_minor bigint not null,
  paid_on date,
  -- The developer's income for this share. While it is linked here, the
  -- transaction cannot be deleted (or changed) in Activity: unsettle the
  -- week instead.
  transaction_id uuid references public.transactions (id),

  constraint mc_shares_amount_range check (amount_minor between 0 and 99999999999),
  constraint mc_shares_me_paid check (not is_me or paid_on is not null)
);

create index mc_shares_week_id_idx on public.mc_shares (week_id);
create index mc_shares_transaction_id_idx on public.mc_shares (transaction_id);

-- Only "paid on" can change, and not on the developer's own share.
create function public.mc_shares_check_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_me then
    raise exception 'mc_shares: your own share is paid when the week is settled' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger mc_shares_check_update
  before update on public.mc_shares
  for each row execute function public.mc_shares_check_update();

-- Spending from a savings fund (the Morning classes savings, or the
-- teachers' book fund, D-56), for school events.
create table public.school_fund_spends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fund text not null,
  account_id uuid references public.accounts (id),
  amount_minor bigint not null,
  spent_on date not null,
  purpose text not null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint school_fund_spends_fund_valid check (fund in ('morning', 'books')),
  constraint school_fund_spends_amount_range check (amount_minor between 1 and 99999999999),
  constraint school_fund_spends_purpose_valid check (purpose in ('sports', 'science_fair', 'teacher_books', 'other')),
  constraint school_fund_spends_note_length check (char_length(note) <= 100),
  constraint school_fund_spends_note_trimmed check (note = btrim(note))
);

create index school_fund_spends_user_fund_idx on public.school_fund_spends (user_id, fund);

create trigger school_fund_spends_fill_account
  before insert on public.school_fund_spends
  for each row execute function public.school_fill_account();

-- What is in a fund now. The books fund is added by the books migration.
create function public.school_fund_balance(p_user_id uuid, p_fund text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (
    case p_fund
      when 'morning' then coalesce((select sum(w.savings_minor) from public.mc_weeks w where w.user_id = p_user_id), 0)
      else 0
    end
    - coalesce((select sum(f.amount_minor) from public.school_fund_spends f where f.user_id = p_user_id and f.fund = p_fund), 0)
  )::bigint
$$;

-- A fund cannot spend more than it has. SECURITY DEFINER so it can use
-- school_fund_balance(), which the app cannot call.
create function public.school_fund_spends_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.school_fund_balance(new.user_id, new.fund) < 0 then
    raise exception 'school_fund_spends: more than the fund has' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger school_fund_spends_check
  after insert on public.school_fund_spends
  for each row execute function public.school_fund_spends_check();

-- A settled week's days cannot change: unsettle the week first. Checked
-- on the old and the new day, so a day cannot move into or out of it.
-- When the whole account is deleted (D-51), its auth.users row is already
-- gone, and the days go with it (as in D-52). SECURITY DEFINER so the
-- check can read auth.users.
create function public.mc_days_check_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if tg_op <> 'INSERT' and exists (
    select 1 from public.mc_weeks w where w.user_id = old.user_id and w.week_start = public.school_monday(old.day)
  ) then
    raise exception 'mc_days: this week is settled' using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' then
    if exists (
      select 1 from public.mc_weeks w where w.user_id = new.user_id and w.week_start = public.school_monday(new.day)
    ) then
      raise exception 'mc_days: this week is settled' using errcode = '23514';
    end if;
    -- Money cannot be collected on a day that has not come yet; a holiday
    -- may be marked ahead.
    if not new.no_class and new.day > (now() at time zone 'Africa/Accra')::date then
      raise exception 'mc_days: the day cannot be in the future' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$$;

create trigger mc_days_check_settled
  before insert or update or delete on public.mc_days
  for each row execute function public.mc_days_check_settled();

-- Settles a week: checks that every pesewa is accounted for, stores the
-- week and the shares, and adds the developer's own share as income. The
-- savings rule itself is worked out by src/lib/school/morning.ts; here the
-- totals are read again from the days, so the stored numbers always add up
-- to what was collected.
--
-- SECURITY DEFINER: the app cannot write mc_weeks, mc_shares or the
-- income transaction's link directly. Every statement filters by the
-- signed-in user.
create function public.mc_settle(
  p_week_start date,
  p_settled_on date,
  p_savings_rule text,
  p_savings_day date,
  p_savings_minor bigint,
  p_leftover_minor bigint,
  p_markers_minor bigint,
  p_assistant_minor bigint,
  p_each_minor bigint,
  p_sharer_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  settings public.school_settings;
  v_class_days integer;
  v_collected bigint;
  v_school bigint;
  v_sharers integer;
  v_week_id uuid;
  v_transaction_id uuid;
  sharer record;
begin
  if uid is null then
    raise exception 'mc_settle: not signed in' using errcode = '42501';
  end if;
  select * into settings from public.school_settings s where s.user_id = uid;
  if not found then
    raise exception 'school money: set up School money first' using errcode = '23503';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'mc_settle: the week must start on a Monday' using errcode = '22023';
  end if;
  if p_settled_on < p_week_start or p_settled_on > (now() at time zone 'Africa/Accra')::date then
    raise exception 'mc_settle: settle on a day in or after the week, not in the future' using errcode = '22023';
  end if;

  select count(*)::int,
         coalesce(sum((d.full_1 + d.full_2 + d.full_3) * d.fee_minor + d.less_1_minor + d.less_2_minor + d.less_3_minor), 0),
         coalesce(sum((d.full_1 + d.full_2 + d.full_3) * d.school_minor), 0)
    into v_class_days, v_collected, v_school
  from public.mc_days d
  where d.user_id = uid and not d.no_class and d.day between p_week_start and p_week_start + 4;
  if v_class_days = 0 then
    raise exception 'mc_settle: there was no class this week' using errcode = '23514';
  end if;

  select count(*)::int into v_sharers
  from public.mc_sharers s
  where s.user_id = uid and s.archived_at is null and s.id = any (p_sharer_ids);
  if v_sharers = 0 or v_sharers <> cardinality(array(select distinct unnest(p_sharer_ids))) then
    raise exception 'mc_settle: sharer not found' using errcode = '23503';
  end if;

  if p_savings_minor < 0 or p_leftover_minor < 0 or p_markers_minor < 0 or p_assistant_minor < 0 or p_each_minor < 0
     or p_leftover_minor >= v_sharers
     or v_school + p_savings_minor + p_markers_minor + p_assistant_minor + p_each_minor * v_sharers <> v_collected then
    raise exception 'mc_settle: the shares do not add up to what was collected' using errcode = '23514';
  end if;

  insert into public.mc_weeks (
    user_id, week_start, settled_on, account_id, class_days, collected_minor, school_minor, savings_rule, savings_day,
    savings_minor, leftover_minor, markers_minor, assistant_minor, each_minor
  ) values (
    uid, p_week_start, p_settled_on, settings.account_id, v_class_days, v_collected, v_school, p_savings_rule, p_savings_day,
    p_savings_minor, p_leftover_minor, p_markers_minor, p_assistant_minor, p_each_minor
  ) returning id into v_week_id;

  for sharer in
    select s.id, s.name, s.is_me from public.mc_sharers s
    where s.user_id = uid and s.id = any (p_sharer_ids)
    order by s.is_me desc, lower(s.name)
  loop
    v_transaction_id := null;
    if sharer.is_me and p_each_minor > 0 then
      insert into public.transactions (
        user_id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source,
        amount_ghs_minor, account_amount_minor, note
      ) values (
        uid, 'income', p_settled_on, settings.account_id, settings.income_category_id, p_each_minor, 'GHS', 1, 'none',
        p_each_minor, p_each_minor, 'Morning classes: my share, week of ' || to_char(p_week_start, 'FMDD Mon YYYY')
      ) returning id into v_transaction_id;
    end if;
    insert into public.mc_shares (user_id, week_id, sharer_id, name, is_me, amount_minor, paid_on, transaction_id)
    values (
      uid, v_week_id, sharer.id, sharer.name, sharer.is_me, p_each_minor,
      case when sharer.is_me then p_settled_on end, v_transaction_id
    );
  end loop;

  return v_week_id;
end;
$$;

-- Undoes a settlement: the week's days can change again, and the
-- developer's income for it is removed.
create function public.mc_unsettle(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_transactions uuid[];
begin
  if uid is null then
    raise exception 'mc_unsettle: not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mc_weeks w where w.id = p_week_id and w.user_id = uid) then
    raise exception 'mc_unsettle: week not found' using errcode = '23503';
  end if;
  select coalesce(array_agg(s.transaction_id) filter (where s.transaction_id is not null), '{}')
    into v_transactions
  from public.mc_shares s where s.week_id = p_week_id and s.user_id = uid;
  delete from public.mc_weeks w where w.id = p_week_id and w.user_id = uid;
  delete from public.transactions t where t.id = any (v_transactions) and t.user_id = uid;
end;
$$;

-- A transaction added by School money cannot be changed in Activity (it
-- would no longer match the share it records). Deleting it is refused by
-- the foreign key. Rows owned by a user being deleted are never updated.
create function public.transactions_protect_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.mc_shares s where s.transaction_id = old.id) then
    raise exception 'transactions: added by School money; change it there' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_protect_school
  before update on public.transactions
  for each row execute function public.transactions_protect_school();

-- Every movement of school money in or out of an account, worked out from
-- the tables above (never stored, like balances, M-8). Positive = into the
-- account. Fees and books add their own rows in later migrations.
create view public.school_cash_moves
with (security_invoker = true)
as
select d.user_id, d.account_id, d.day as occurred_on, 'morning'::text as source, null::uuid as ref_id,
       (d.full_1 + d.full_2 + d.full_3) * d.fee_minor + d.less_1_minor + d.less_2_minor + d.less_3_minor as amount_minor
from public.mc_days d
where not d.no_class
union all
select w.user_id, w.account_id, w.settled_on, 'morning', null, -(w.school_minor + w.markers_minor + w.assistant_minor)
from public.mc_weeks w
union all
select s.user_id, w.account_id, s.paid_on, 'morning', null, -s.amount_minor
from public.mc_shares s
join public.mc_weeks w on w.id = s.week_id
where s.paid_on is not null
union all
select f.user_id, f.account_id, f.spent_on, 'fund_' || f.fund, null, -f.amount_minor
from public.school_fund_spends f;

-- Balances now add the school money held in each account (M-8, D-54).
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  (a.opening_balance_minor + coalesce(moves.change_minor, 0) + coalesce(school.change_minor, 0))::bigint as balance_minor,
  exists (
    select 1 from public.transactions t where t.account_id = a.id or t.to_account_id = a.id
  ) or exists (
    select 1 from public.school_cash_moves m where m.account_id = a.id
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
) moves on true
left join lateral (
  select sum(m.amount_minor) as change_minor
  from public.school_cash_moves m
  where m.account_id = a.id and m.occurred_on >= a.opening_balance_on
) school on true;

-- An account holding school money keeps its currency (GHS), like one with
-- transactions or recurring transfers (the recurring migration's version,
-- with school money added).
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
    or exists (select 1 from public.school_cash_moves m where m.account_id = old.id)
  ) then
    raise exception 'accounts: the currency of an account with transactions or recurring transfers cannot change'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table public.school_settings enable row level security;
alter table public.mc_sharers enable row level security;
alter table public.mc_days enable row level security;
alter table public.mc_weeks enable row level security;
alter table public.mc_shares enable row level security;
alter table public.school_fund_spends enable row level security;

create policy school_settings_select_own on public.school_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_settings_insert_own on public.school_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_settings_update_own on public.school_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy mc_sharers_select_own on public.mc_sharers
  for select to authenticated using (user_id = (select auth.uid()));
create policy mc_sharers_insert_own on public.mc_sharers
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy mc_sharers_update_own on public.mc_sharers
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy mc_days_select_own on public.mc_days
  for select to authenticated using (user_id = (select auth.uid()));
create policy mc_days_insert_own on public.mc_days
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy mc_days_update_own on public.mc_days
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy mc_days_delete_own on public.mc_days
  for delete to authenticated using (user_id = (select auth.uid()));

create policy mc_weeks_select_own on public.mc_weeks
  for select to authenticated using (user_id = (select auth.uid()));

create policy mc_shares_select_own on public.mc_shares
  for select to authenticated using (user_id = (select auth.uid()));
create policy mc_shares_update_own on public.mc_shares
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy school_fund_spends_select_own on public.school_fund_spends
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_fund_spends_insert_own on public.school_fund_spends
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_fund_spends_delete_own on public.school_fund_spends
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.school_settings to authenticated;
grant insert (account_id, income_category_id) on public.school_settings to authenticated;
grant update (account_id, income_category_id, book_transport_minor, book_mine_minor) on public.school_settings to authenticated;

grant select on public.mc_sharers to authenticated;
grant insert (name, is_me) on public.mc_sharers to authenticated;
grant update (name, archived_at) on public.mc_sharers to authenticated;

grant select, delete on public.mc_days to authenticated;
grant insert (day, no_class, reason, note, full_1, full_2, full_3, less_1_minor, less_2_minor, less_3_minor)
  on public.mc_days to authenticated;
grant update (no_class, reason, note, full_1, full_2, full_3, less_1_minor, less_2_minor, less_3_minor)
  on public.mc_days to authenticated;

grant select on public.mc_weeks to authenticated;
grant select on public.mc_shares to authenticated;
grant update (paid_on) on public.mc_shares to authenticated;

grant select, delete on public.school_fund_spends to authenticated;
grant insert (fund, amount_minor, spent_on, purpose, note) on public.school_fund_spends to authenticated;

grant select on public.school_cash_moves to authenticated;

revoke execute on function public.mc_settle(date, date, text, date, bigint, bigint, bigint, bigint, bigint, uuid[]) from public, anon;
grant execute on function public.mc_settle(date, date, text, date, bigint, bigint, bigint, bigint, bigint, uuid[]) to authenticated;
revoke execute on function public.mc_unsettle(uuid) from public, anon;
grant execute on function public.mc_unsettle(uuid) to authenticated;
revoke execute on function public.school_fund_balance(uuid, text) from public, anon, authenticated;
revoke execute on function public.school_fund_spends_check() from public, anon, authenticated;
revoke execute on function public.mc_days_check_settled() from public, anon, authenticated;
