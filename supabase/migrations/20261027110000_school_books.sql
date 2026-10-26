-- Past questions books (D-56). Students pay per subject (usually GHS 80);
-- the developer buys the books, then gives them out. Until a book is given
-- out its money is not divided. When it is, its price splits into:
--   book cost  what that copy cost (books are given out in the order they
--              were bought, so each copy counts at its real price);
--   transport  GHS 5 per book (a setting);
--   mine       GHS 20 per book (a setting), the developer's income;
--   teachers   the rest, into the teachers' book fund (a separate fund).
-- A dearer book takes from the teachers' part first; above that, from mine.

create table public.book_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  -- The price for new orders. An order keeps the price it was made at.
  price_minor bigint not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint book_subjects_name_length check (char_length(name) between 1 and 40),
  constraint book_subjects_name_trimmed check (name = btrim(name)),
  constraint book_subjects_price_range check (price_minor between 1 and 99999999999)
);

create unique index book_subjects_user_name_key on public.book_subjects (user_id, lower(name));

create trigger book_subjects_set_updated_at
  before update on public.book_subjects
  for each row execute function public.set_updated_at();

create table public.book_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.book_subjects (id),
  account_id uuid references public.accounts (id),
  quantity integer not null,
  amount_minor bigint not null,
  bought_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint book_purchases_quantity_range check (quantity between 1 and 10000),
  constraint book_purchases_amount_range check (amount_minor between 1 and 99999999999),
  constraint book_purchases_note_length check (char_length(note) <= 100),
  constraint book_purchases_note_trimmed check (note = btrim(note))
);

create index book_purchases_subject_idx on public.book_purchases (subject_id, bought_on, created_at, id);

create trigger book_purchases_fill_account
  before insert on public.book_purchases
  for each row execute function public.school_fill_account();

-- One student's book of one subject.
create table public.book_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.school_students (id),
  subject_id uuid not null references public.book_subjects (id),
  price_minor bigint not null,
  -- Filled in when the book is given out (books_give_out), frozen.
  given_on date,
  given_seq integer,
  -- The school money account the split left from.
  account_id uuid references public.accounts (id),
  cost_minor bigint,
  transport_minor bigint,
  mine_minor bigint,
  teachers_minor bigint,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),

  constraint book_orders_price_range check (price_minor between 1 and 99999999999),
  constraint book_orders_given_shape check (
    (given_on is null and given_seq is null and account_id is null and cost_minor is null and transport_minor is null
      and mine_minor is null and teachers_minor is null and transaction_id is null)
    or (given_on is not null and given_seq is not null and account_id is not null and cost_minor >= 0 and transport_minor >= 0
      and mine_minor >= 0 and teachers_minor >= 0
      and cost_minor + transport_minor + mine_minor + teachers_minor = price_minor)
  )
);

create unique index book_orders_student_subject_key on public.book_orders (student_id, subject_id);
create index book_orders_subject_idx on public.book_orders (subject_id, given_seq);
create index book_orders_transaction_id_idx on public.book_orders (transaction_id);

create table public.book_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.school_students (id),
  account_id uuid references public.accounts (id),
  amount_minor bigint not null,
  paid_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint book_payments_amount_range check (amount_minor between 1 and 99999999999),
  constraint book_payments_note_length check (char_length(note) <= 100),
  constraint book_payments_note_trimmed check (note = btrim(note))
);

create index book_payments_student_idx on public.book_payments (student_id);

create trigger book_payments_fill_account
  before insert on public.book_payments
  for each row execute function public.school_fill_account();

-- Rows point only to the same user's subjects and students.
create function public.books_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nested: a field is read only on the tables that have it.
  if tg_table_name in ('book_purchases', 'book_orders') then
    if not exists (select 1 from public.book_subjects s where s.id = new.subject_id and s.user_id = new.user_id) then
      raise exception '%: subject not found', tg_table_name using errcode = '23503';
    end if;
  end if;
  if tg_table_name in ('book_orders', 'book_payments') then
    if not exists (select 1 from public.school_students s where s.id = new.student_id and s.user_id = new.user_id) then
      raise exception '%: student not found', tg_table_name using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger book_purchases_check_refs before insert on public.book_purchases
  for each row execute function public.books_check_refs();
create trigger book_orders_check_refs before insert on public.book_orders
  for each row execute function public.books_check_refs();
create trigger book_payments_check_refs before insert on public.book_payments
  for each row execute function public.books_check_refs();

-- What a student has paid for books, and the price of the books they got.
create function public.books_student_paid(p_student_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.amount_minor), 0)::bigint from public.book_payments p where p.student_id = p_student_id
$$;

create function public.books_student_given(p_student_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(o.price_minor), 0)::bigint from public.book_orders o
  where o.student_id = p_student_id and o.given_on is not null
$$;

-- A purchase whose books were already given out cannot be deleted: their
-- cost came from it. A given-out order and a payment that paid for given
-- books cannot be deleted either. (All go when the account is deleted.)
create function public.books_check_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint;
  v_given bigint;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if tg_table_name = 'book_purchases' then
    select coalesce(sum(p.quantity), 0) into v_before from public.book_purchases p
    where p.subject_id = old.subject_id and p.id <> old.id
      and (p.bought_on, p.created_at, p.id) < (old.bought_on, old.created_at, old.id);
    select count(*) into v_given from public.book_orders o where o.subject_id = old.subject_id and o.given_on is not null;
    if v_given > v_before then
      raise exception 'book_purchases: some of these books were given out' using errcode = '23514';
    end if;
  elsif tg_table_name = 'book_orders' then
    if old.given_on is not null then
      raise exception 'book_orders: this book was given out; undo that first' using errcode = '23514';
    end if;
  elsif public.books_student_paid(old.student_id) < public.books_student_given(old.student_id) then
    raise exception 'book_payments: this money paid for books already given out' using errcode = '23514';
  end if;
  return old;
end;
$$;

-- A purchase cannot be dated before copies already given out from later
-- purchases: their costs were worked out in buying order and are frozen,
-- so a copy slipped in before them would never be counted (D-56).
create function public.book_purchases_check_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_before bigint;
  v_given bigint;
begin
  select coalesce(sum(p.quantity), 0) into v_before from public.book_purchases p
  where p.subject_id = new.subject_id
    and (p.bought_on, p.created_at, p.id) < (new.bought_on, new.created_at, new.id);
  select count(*) into v_given from public.book_orders o where o.subject_id = new.subject_id and o.given_on is not null;
  if v_given > v_before then
    raise exception 'book_purchases: books bought after this date were already given out' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger book_purchases_check_order before insert on public.book_purchases
  for each row execute function public.book_purchases_check_order();

create trigger book_purchases_check_delete before delete on public.book_purchases
  for each row execute function public.books_check_delete();
create trigger book_orders_check_delete before delete on public.book_orders
  for each row execute function public.books_check_delete();
create constraint trigger book_payments_check_delete after delete on public.book_payments
  for each row execute function public.books_check_delete();

-- Gives out books to one student. For each: there must be a copy in
-- stock, the student must have paid for everything given so far, and the
-- price splits as described at the top. The developer's part becomes
-- income (one transaction per book, so Undo can remove just one).
create function public.books_give_out(p_order_ids uuid[], p_given_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  settings public.school_settings;
  v_student uuid;
  v_order record;
  v_given integer;
  v_bought integer;
  v_purchase record;
  v_cost bigint;
  v_mine bigint;
  v_teachers bigint;
  v_transaction_id uuid;
begin
  if uid is null then
    raise exception 'books_give_out: not signed in' using errcode = '42501';
  end if;
  select * into settings from public.school_settings s where s.user_id = uid;
  if not found then
    raise exception 'school money: set up School money first' using errcode = '23503';
  end if;
  if p_given_on > (now() at time zone 'Africa/Accra')::date then
    raise exception 'books_give_out: the date cannot be in the future' using errcode = '22023';
  end if;
  if cardinality(p_order_ids) = 0 then
    raise exception 'books_give_out: choose at least one book' using errcode = '22023';
  end if;

  for v_order in
    select o.id, o.student_id, o.subject_id, o.price_minor, o.given_on, sub.name as subject, st.name as student
    from public.book_orders o
    join public.book_subjects sub on sub.id = o.subject_id
    join public.school_students st on st.id = o.student_id
    where o.id = any (p_order_ids) and o.user_id = uid
    order by sub.name, o.id
    for update of o
  loop
    if v_order.given_on is not null then
      raise exception 'books_give_out: % was already given out', v_order.subject using errcode = '23514';
    end if;
    if v_student is not null and v_student <> v_order.student_id then
      raise exception 'books_give_out: give out to one student at a time' using errcode = '22023';
    end if;
    v_student := v_order.student_id;

    -- Stock: bought minus given out, for this subject.
    select count(*)::int into v_given from public.book_orders o where o.subject_id = v_order.subject_id and o.given_on is not null;
    select coalesce(sum(p.quantity), 0)::int into v_bought from public.book_purchases p where p.subject_id = v_order.subject_id;
    if v_given >= v_bought then
      raise exception 'books_give_out: no % books left; record the books you bought first', v_order.subject using errcode = '23514';
    end if;

    -- The next copy in the order the books were bought: copy number
    -- v_given + 1. Within a purchase, copies share its amount exactly
    -- (k-th copy = floor(amount·k/q) − floor(amount·(k−1)/q)).
    select p.amount_minor, p.quantity, v_given + 1 - (p.before)::int as k into v_purchase
    from (
      select p.*, coalesce(sum(p.quantity) over (order by p.bought_on, p.created_at, p.id rows between unbounded preceding and 1 preceding), 0) as before
      from public.book_purchases p where p.subject_id = v_order.subject_id
    ) p
    where p.before < v_given + 1 and p.before + p.quantity >= v_given + 1;
    v_cost := (v_purchase.amount_minor * v_purchase.k) / v_purchase.quantity
            - (v_purchase.amount_minor * (v_purchase.k - 1)) / v_purchase.quantity;

    v_mine := settings.book_mine_minor;
    v_teachers := v_order.price_minor - v_cost - settings.book_transport_minor - v_mine;
    if v_teachers < 0 then
      v_mine := v_mine + v_teachers;
      v_teachers := 0;
    end if;
    if v_mine < 0 then
      raise exception 'books_give_out: the price of % does not cover its cost and transport', v_order.subject using errcode = '23514';
    end if;

    v_transaction_id := null;
    if v_mine > 0 then
      insert into public.transactions (
        user_id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source,
        amount_ghs_minor, account_amount_minor, note
      ) values (
        uid, 'income', p_given_on, settings.account_id, settings.income_category_id, v_mine, 'GHS', 1, 'none',
        v_mine, v_mine, left('Past questions: ' || v_order.subject || ' for ' || v_order.student, 200)
      ) returning id into v_transaction_id;
    end if;

    update public.book_orders o set
      given_on = p_given_on,
      given_seq = v_given + 1,
      account_id = settings.account_id,
      cost_minor = v_cost,
      transport_minor = settings.book_transport_minor,
      mine_minor = v_mine,
      teachers_minor = v_teachers,
      transaction_id = v_transaction_id
    where o.id = v_order.id;
  end loop;

  if v_student is null then
    raise exception 'books_give_out: book not found' using errcode = '23503';
  end if;
  if public.books_student_paid(v_student) < public.books_student_given(v_student) then
    raise exception 'books_give_out: the student has not paid for these books yet' using errcode = '23514';
  end if;
end;
$$;

-- Undoes giving out one book: only the last one given out of its subject,
-- so the copies' costs stay in the order they were bought.
create function public.books_undo_give(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_order public.book_orders;
begin
  if uid is null then
    raise exception 'books_undo_give: not signed in' using errcode = '42501';
  end if;
  select * into v_order from public.book_orders o where o.id = p_order_id and o.user_id = uid and o.given_on is not null for update;
  if not found then
    raise exception 'books_undo_give: book not found' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.book_orders o where o.subject_id = v_order.subject_id and o.given_seq > v_order.given_seq
  ) then
    raise exception 'books_undo_give: only the last book given out of a subject can be undone' using errcode = '23514';
  end if;
  update public.book_orders o set
    given_on = null, given_seq = null, account_id = null, cost_minor = null, transport_minor = null,
    mine_minor = null, teachers_minor = null, transaction_id = null
  where o.id = v_order.id;
  if v_order.transaction_id is not null then
    delete from public.transactions t where t.id = v_order.transaction_id and t.user_id = uid;
  end if;
  -- Taking back a paid-for book never leaves a payment short. But the
  -- teachers' part it put in the book fund must not be spent already.
  if public.school_fund_balance(uid, 'books') < 0 then
    raise exception 'books_undo_give: the teachers'' part of this book was already used' using errcode = '23514';
  end if;
end;
$$;

-- The teachers' book fund: what given-out books put in, minus spending.
create or replace function public.school_fund_balance(p_user_id uuid, p_fund text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (
    case p_fund
      when 'morning' then coalesce((select sum(w.savings_minor) from public.mc_weeks w where w.user_id = p_user_id), 0)
      when 'books' then coalesce((
        select sum(o.teachers_minor) from public.book_orders o where o.user_id = p_user_id and o.given_on is not null
      ), 0)
      else 0
    end
    - coalesce((select sum(f.amount_minor) from public.school_fund_spends f where f.user_id = p_user_id and f.fund = p_fund), 0)
  )::bigint
$$;

create or replace function public.transactions_protect_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.mc_shares s where s.transaction_id = old.id)
     or exists (select 1 from public.school_handovers h where h.transaction_id = old.id)
     or exists (select 1 from public.book_orders o where o.transaction_id = old.id) then
    raise exception 'transactions: added by School money; change it there' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace view public.school_cash_moves
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
from public.school_fund_spends f
union all
select p.user_id, p.account_id, p.paid_on, 'fee', fs.fee_id, p.amount_minor
from public.school_fee_payments p
join public.school_fee_students fs on fs.id = p.fee_student_id
union all
select h.user_id, h.account_id, h.handed_on, 'fee', h.fee_id, -h.amount_minor
from public.school_handovers h
union all
select p.user_id, p.account_id, p.paid_on, 'books', null, p.amount_minor
from public.book_payments p
union all
select p.user_id, p.account_id, p.bought_on, 'books', null, -p.amount_minor
from public.book_purchases p
union all
-- A given-out book: transport is spent, and my part becomes income. Both
-- leave the school money (the income comes back in as a transaction).
select o.user_id, o.account_id, o.given_on, 'books', null, -(o.transport_minor + o.mine_minor)
from public.book_orders o
where o.given_on is not null;

-- What is held for the school, added up by the database (one row per
-- source and fee), so a long history is never cut off by the API's row
-- limit. Runs with the caller's rights: only their own moves.
create function public.school_held_by_source()
returns table (source text, ref_id uuid, amount_minor bigint)
language sql
stable
set search_path = ''
as $$
  select m.source, m.ref_id, sum(m.amount_minor)::bigint
  from public.school_cash_moves m
  group by m.source, m.ref_id
$$;

alter table public.book_subjects enable row level security;
alter table public.book_purchases enable row level security;
alter table public.book_orders enable row level security;
alter table public.book_payments enable row level security;

create policy book_subjects_select_own on public.book_subjects
  for select to authenticated using (user_id = (select auth.uid()));
create policy book_subjects_insert_own on public.book_subjects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy book_subjects_update_own on public.book_subjects
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy book_purchases_select_own on public.book_purchases
  for select to authenticated using (user_id = (select auth.uid()));
create policy book_purchases_insert_own on public.book_purchases
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy book_purchases_delete_own on public.book_purchases
  for delete to authenticated using (user_id = (select auth.uid()));

create policy book_orders_select_own on public.book_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy book_orders_insert_own on public.book_orders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy book_orders_delete_own on public.book_orders
  for delete to authenticated using (user_id = (select auth.uid()));

create policy book_payments_select_own on public.book_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy book_payments_insert_own on public.book_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy book_payments_delete_own on public.book_payments
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.book_subjects to authenticated;
grant insert (name, price_minor) on public.book_subjects to authenticated;
grant update (name, price_minor, archived_at) on public.book_subjects to authenticated;

grant select, delete on public.book_purchases to authenticated;
grant insert (subject_id, quantity, amount_minor, bought_on, note) on public.book_purchases to authenticated;

-- Orders are given out only by books_give_out().
grant select, delete on public.book_orders to authenticated;
grant insert (student_id, subject_id, price_minor) on public.book_orders to authenticated;

grant select, delete on public.book_payments to authenticated;
grant insert (student_id, amount_minor, paid_on, note) on public.book_payments to authenticated;

revoke execute on function public.books_check_delete() from public, anon, authenticated;
revoke execute on function public.books_student_paid(uuid) from public, anon;
revoke execute on function public.books_student_given(uuid) from public, anon;
grant execute on function public.books_student_paid(uuid) to authenticated;
grant execute on function public.books_student_given(uuid) to authenticated;
revoke execute on function public.books_give_out(uuid[], date) from public, anon;
grant execute on function public.books_give_out(uuid[], date) to authenticated;
revoke execute on function public.school_held_by_source() from public, anon;
grant execute on function public.school_held_by_source() to authenticated;
revoke execute on function public.books_undo_give(uuid) from public, anon;
grant execute on function public.books_undo_give(uuid) to authenticated;
