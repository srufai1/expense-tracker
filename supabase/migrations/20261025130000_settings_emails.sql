-- Settings and the weekly email log (DESIGN §6.8, D-17, D-27, D-34, D-42).

-- One row per user. Without a row, the defaults apply: the weekly email is
-- on (D-17). The email goes to the sign-in address (D-42).
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weekly_email boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

create policy settings_select_own on public.settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert_own on public.settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update_own on public.settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- D-28: the columns the app writes.
grant select on public.settings to authenticated;
grant insert (weekly_email) on public.settings to authenticated;
grant update (weekly_email) on public.settings to authenticated;

-- One row per user and week: written by the daily job only, so the same
-- week's email is never sent twice. Before sending, a run claims the week by
-- writing "sending" (an insert that does nothing if the row exists, or an
-- update from "failed"); only the run that changed a row sends. A failed
-- week is claimed again on the next run. A week left in "sending" (the run
-- stopped mid-way) may have been sent, so it is never sent again
-- automatically.
create table public.report_emails (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The Monday the week starts on (D-14).
  week_start date not null,
  status text not null,
  sent_at timestamptz,
  error text not null default '',
  updated_at timestamptz not null default now(),

  constraint report_emails_pkey primary key (user_id, week_start),
  constraint report_emails_week_monday check (extract(isodow from week_start) = 1),
  constraint report_emails_status_valid check (status in ('sending', 'sent', 'failed')),
  constraint report_emails_sent_at check ((status = 'sent') = (sent_at is not null)),
  constraint report_emails_error_length check (char_length(error) <= 500)
);

create trigger report_emails_set_updated_at
  before update on public.report_emails
  for each row execute function public.set_updated_at();

alter table public.report_emails enable row level security;

-- The user can see their own log (for example "last sent"), never write it.
create policy report_emails_select_own on public.report_emails
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.report_emails to authenticated;

-- The daily job (service_role, no signed-in user) reads the settings and
-- the report data, and writes the log. RLS does not apply to it, so its
-- code filters every read by user_id (src/lib/reports/load.ts).
grant select on public.settings to service_role;
grant select, insert, update on public.report_emails to service_role;
grant select on public.budgets to service_role;
