-- School fees held for the school (D-55): entrance exam fees, mock fees and
-- any other fee. Each fee is made per occasion with its usual amount; each
-- student on it has what they should pay (0 = a full discount). Payments
-- come in; hand-overs go out to the headmaster, headmistress, headteacher
-- (academics), the bursar, or to the developer themself. Like Morning
-- classes, the money is in the school money account but not income.

-- Students, typed in once and used by fees and books. No class history:
-- the class is a label for finding the student.
create table public.school_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  class_name text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint school_students_name_length check (char_length(name) between 1 and 80),
  constraint school_students_name_trimmed check (name = btrim(name)),
  constraint school_students_class_length check (char_length(class_name) <= 20),
  constraint school_students_class_trimmed check (class_name = btrim(class_name))
);

create unique index school_students_user_name_key on public.school_students (user_id, lower(name), lower(class_name));

create table public.school_fees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  -- What a student added to this fee pays, unless changed for them.
  amount_minor bigint not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_fees_name_length check (char_length(name) between 1 and 60),
  constraint school_fees_name_trimmed check (name = btrim(name)),
  constraint school_fees_amount_range check (amount_minor between 0 and 99999999999)
);

create unique index school_fees_user_name_key on public.school_fees (user_id, lower(name));

create trigger school_fees_set_updated_at
  before update on public.school_fees
  for each row execute function public.set_updated_at();

-- A student on a fee, with what they should pay.
create table public.school_fee_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fee_id uuid not null references public.school_fees (id) on delete cascade,
  student_id uuid not null references public.school_students (id),
  payable_minor bigint not null,

  constraint school_fee_students_payable_range check (payable_minor between 0 and 99999999999)
);

create unique index school_fee_students_fee_student_key on public.school_fee_students (fee_id, student_id);
create index school_fee_students_student_id_idx on public.school_fee_students (student_id);

create table public.school_fee_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A student with payments stays on the fee.
  fee_student_id uuid not null references public.school_fee_students (id),
  account_id uuid references public.accounts (id),
  amount_minor bigint not null,
  paid_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint school_fee_payments_amount_range check (amount_minor between 1 and 99999999999),
  constraint school_fee_payments_note_length check (char_length(note) <= 100),
  constraint school_fee_payments_note_trimmed check (note = btrim(note))
);

create index school_fee_payments_fee_student_id_idx on public.school_fee_payments (fee_student_id);

create trigger school_fee_payments_fill_account
  before insert on public.school_fee_payments
  for each row execute function public.school_fill_account();

-- Money handed over from a fee. To "myself" it becomes the developer's
-- income (linked transaction). Written only by school_hand_over().
create table public.school_handovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fee_id uuid not null references public.school_fees (id),
  account_id uuid not null references public.accounts (id),
  to_whom text not null,
  amount_minor bigint not null,
  handed_on date not null,
  note text not null default '',
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),

  constraint school_handovers_to_whom_valid
    check (to_whom in ('headmaster', 'headmistress', 'headteacher_academics', 'bursar', 'myself')),
  constraint school_handovers_amount_range check (amount_minor between 1 and 99999999999),
  constraint school_handovers_myself_income check ((to_whom = 'myself') = (transaction_id is not null)),
  constraint school_handovers_note_length check (char_length(note) <= 100),
  constraint school_handovers_note_trimmed check (note = btrim(note))
);

create index school_handovers_fee_id_idx on public.school_handovers (fee_id);
create index school_handovers_transaction_id_idx on public.school_handovers (transaction_id);

-- A fee and a student on it belong to the same user.
create function public.school_fee_students_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.school_fees f where f.id = new.fee_id and f.user_id = new.user_id) then
    raise exception 'school_fee_students: fee not found' using errcode = '23503';
  end if;
  if not exists (select 1 from public.school_students s where s.id = new.student_id and s.user_id = new.user_id) then
    raise exception 'school_fee_students: student not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger school_fee_students_check
  before insert or update on public.school_fee_students
  for each row execute function public.school_fee_students_check();

create function public.school_fee_payments_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_fee_students fs where fs.id = new.fee_student_id and fs.user_id = new.user_id
  ) then
    raise exception 'school_fee_payments: student not found on this fee' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger school_fee_payments_check
  before insert on public.school_fee_payments
  for each row execute function public.school_fee_payments_check();

-- What is held for a fee: paid in, minus handed over.
create function public.school_fee_held(p_fee_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (
    coalesce((
      select sum(p.amount_minor) from public.school_fee_payments p
      join public.school_fee_students fs on fs.id = p.fee_student_id
      where fs.fee_id = p_fee_id
    ), 0)
    - coalesce((select sum(h.amount_minor) from public.school_handovers h where h.fee_id = p_fee_id), 0)
  )::bigint
$$;

-- Deleting a payment may not leave less than was already handed over.
-- (When the whole account is deleted, everything goes together.)
create function public.school_fee_payments_check_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee_id uuid;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  select fs.fee_id into v_fee_id from public.school_fee_students fs where fs.id = old.fee_student_id;
  if v_fee_id is not null and public.school_fee_held(v_fee_id) < 0 then
    raise exception 'school_fee_payments: this money was already handed over' using errcode = '23514';
  end if;
  return old;
end;
$$;

create constraint trigger school_fee_payments_check_delete
  after delete on public.school_fee_payments
  for each row execute function public.school_fee_payments_check_delete();

-- Hands money over from a fee. To "myself", it becomes income.
-- SECURITY DEFINER: it writes the hand-over and the income together.
create function public.school_hand_over(
  p_fee_id uuid,
  p_to_whom text,
  p_amount_minor bigint,
  p_handed_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  settings public.school_settings;
  v_fee_name text;
  v_transaction_id uuid;
  v_id uuid;
begin
  if uid is null then
    raise exception 'school_hand_over: not signed in' using errcode = '42501';
  end if;
  select * into settings from public.school_settings s where s.user_id = uid;
  if not found then
    raise exception 'school money: set up School money first' using errcode = '23503';
  end if;
  select f.name into v_fee_name from public.school_fees f where f.id = p_fee_id and f.user_id = uid for update;
  if not found then
    raise exception 'school_hand_over: fee not found' using errcode = '23503';
  end if;
  if p_handed_on > (now() at time zone 'Africa/Accra')::date then
    raise exception 'school_hand_over: the date cannot be in the future' using errcode = '22023';
  end if;
  if p_amount_minor > public.school_fee_held(p_fee_id) then
    raise exception 'school_hand_over: more than you are holding for this fee' using errcode = '23514';
  end if;

  if p_to_whom = 'myself' then
    insert into public.transactions (
      user_id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source,
      amount_ghs_minor, account_amount_minor, note
    ) values (
      uid, 'income', p_handed_on, settings.account_id, settings.income_category_id, p_amount_minor, 'GHS', 1, 'none',
      p_amount_minor, p_amount_minor, left(v_fee_name || ': kept myself', 200)
    ) returning id into v_transaction_id;
  end if;

  insert into public.school_handovers (user_id, fee_id, account_id, to_whom, amount_minor, handed_on, note, transaction_id)
  values (uid, p_fee_id, settings.account_id, p_to_whom, p_amount_minor, p_handed_on, btrim(p_note), v_transaction_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Undoes a hand-over (and its income, for "myself").
create function public.school_undo_handover(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_transaction_id uuid;
begin
  if uid is null then
    raise exception 'school_undo_handover: not signed in' using errcode = '42501';
  end if;
  delete from public.school_handovers h where h.id = p_id and h.user_id = uid returning h.transaction_id into v_transaction_id;
  if not found then
    raise exception 'school_undo_handover: hand-over not found' using errcode = '23503';
  end if;
  if v_transaction_id is not null then
    delete from public.transactions t where t.id = v_transaction_id and t.user_id = uid;
  end if;
end;
$$;

-- Income added by School money cannot be changed in Activity.
create or replace function public.transactions_protect_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.mc_shares s where s.transaction_id = old.id)
     or exists (select 1 from public.school_handovers h where h.transaction_id = old.id) then
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
from public.school_handovers h;

alter table public.school_students enable row level security;
alter table public.school_fees enable row level security;
alter table public.school_fee_students enable row level security;
alter table public.school_fee_payments enable row level security;
alter table public.school_handovers enable row level security;

create policy school_students_select_own on public.school_students
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_students_insert_own on public.school_students
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_students_update_own on public.school_students
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy school_fees_select_own on public.school_fees
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_fees_insert_own on public.school_fees
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_fees_update_own on public.school_fees
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy school_fee_students_select_own on public.school_fee_students
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_fee_students_insert_own on public.school_fee_students
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_fee_students_update_own on public.school_fee_students
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy school_fee_students_delete_own on public.school_fee_students
  for delete to authenticated using (user_id = (select auth.uid()));

create policy school_fee_payments_select_own on public.school_fee_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy school_fee_payments_insert_own on public.school_fee_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy school_fee_payments_delete_own on public.school_fee_payments
  for delete to authenticated using (user_id = (select auth.uid()));

create policy school_handovers_select_own on public.school_handovers
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.school_students to authenticated;
grant insert (name, class_name) on public.school_students to authenticated;
grant update (name, class_name, archived_at) on public.school_students to authenticated;

grant select on public.school_fees to authenticated;
grant insert (name, amount_minor) on public.school_fees to authenticated;
grant update (name, amount_minor, archived_at) on public.school_fees to authenticated;

grant select, delete on public.school_fee_students to authenticated;
grant insert (fee_id, student_id, payable_minor) on public.school_fee_students to authenticated;
grant update (payable_minor) on public.school_fee_students to authenticated;

grant select, delete on public.school_fee_payments to authenticated;
grant insert (fee_student_id, amount_minor, paid_on, note) on public.school_fee_payments to authenticated;

grant select on public.school_handovers to authenticated;

revoke execute on function public.school_fee_held(uuid) from public, anon;
grant execute on function public.school_fee_held(uuid) to authenticated;
revoke execute on function public.school_fee_payments_check_delete() from public, anon, authenticated;
revoke execute on function public.school_hand_over(uuid, text, bigint, date, text) from public, anon;
grant execute on function public.school_hand_over(uuid, text, bigint, date, text) to authenticated;
revoke execute on function public.school_undo_handover(uuid) from public, anon;
grant execute on function public.school_undo_handover(uuid) to authenticated;
