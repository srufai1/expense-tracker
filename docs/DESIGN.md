# Expense Tracker — Design Document

**Status:** Approved 23 October 2026 (Q-5 to be settled before build step 5).
**Date:** 23 October 2026
**Mockups:** https://claude.ai/artifact/4VJ4uDkV2BbFxqRFYV32BJ (10 screens)

This document explains *what* we will build and *why* each choice was made.
Section 12 lists questions that still need your answer.

---

## 1. Goal

A personal web app to record income and spending, and to get a clear report
every week: how much came in, how much went out, where it went, and what to do
about it.

It must work well on a phone, because that is where most transactions are
entered. It installs on the home screen like an app (PWA), but it is a website,
so it also works on a laptop.

## 2. Decisions already made

These come from your answers in the questionnaire. Each has a number so we can
refer to it later ("see D-07"). If a decision changes, we add a new one — we do
not silently edit the old one.

| # | Decision |
|---|---|
| D-01 | One user only (you). No sharing, no family accounts. |
| D-02 | Sign in with email + password. |
| D-03 | Currencies: GHS and USD. Reports are always in GHS. Every USD transaction keeps its **original amount, currency and the rate used**, as evidence. |
| D-04 | The USD → GHS rate is **fetched automatically** each day. You can always overwrite it on a transaction. |
| D-05 | Account types: Cash, Bank, Mobile Money, Card. Each account has its own balance and one currency. |
| D-06 | Moving money between your own accounts is a **transfer**. It is not income and not spending. |
| D-07 | Fees (MoMo, bank, transfer) are expenses in a **"Fees & Charges"** category. |
| D-08 | Categories start from an editable starter list, with **two levels** (e.g. Food → Groceries). |
| D-09 | Income categories: Salary + Other income to start; the list is editable. |
| D-10 | Receipt photo is **optional** on any transaction (version 1). |
| D-11 | **Recurring** transactions (salary, rent, subscriptions) are created automatically (version 1). |
| D-12 | Bank/MoMo statement import: **version 2**. |
| D-13 | Online only. No offline mode. |
| D-14 | The week runs **Monday to Sunday**. |
| D-15 | Weekly report: totals + net, most/least spent on, biggest expense, comparison with last week and the 4-week average, daily spending chart. |
| D-16 | Budgets are set **per month**, and the weekly report shows progress against them. |
| D-17 | Report delivery: **in the app + an email every Monday**. |
| D-18 | Suggestions come from **fixed rules** in version 1. AI suggestions are an optional extra in version 2. |
| D-19 | Also in version 1: monthly report, custom date range, year summary, savings goals. |
| D-20 | Export: Excel, and the report as a **downloadable PDF file** (not the browser print screen). |
| D-21 | Stack: Next.js + Supabase + Vercel (the same as GPIS). |
| D-22 | Installable on the phone (PWA). Theme follows the phone's light/dark setting. |
| D-23 | **One release** when everything is finished (no early partial release). |
| D-24 | A savings goal is a **label**: contributions are recorded against the goal, and the money stays in its account (Q-1). |
| D-25 | Budgets are set on top-level categories, with **optional sub-category budgets** that may not add up to more than the parent (Q-2). |
| D-26 | Any transaction can be edited or deleted at any time, with a 10-second **Undo** after a delete. Past reports reflect the current data (Q-3). |
| D-27 | The Monday email is sent even for an empty week, with the note "Nothing recorded this week" (Q-4). |
| D-28 | Supabase project settings: "Automatically expose new tables" is **off** and "Enable automatic RLS" is **on**. So every migration grants table access to the `authenticated` role explicitly, next to the table's RLS policies. Nothing is reachable through the Data API until a migration opens it. (23 Oct 2026) |
| D-29 | An account's balance may be **negative** (an overdraft, or a card where money is owed). Negative balances are shown in red. (23 Oct 2026) |
| D-30 | Each account's opening balance has a **date** (`opening_balance_on`, default today). Only transactions on or after that date change the balance. Earlier transactions still count in reports, so older spending can be added for history without being subtracted twice. (23 Oct 2026) |
| D-31 | **Form errors appear in a pop-up**, on every form. When saving fails, a modal lists what is wrong; tapping OK closes it and moves to the first wrong field. The wrong fields stay outlined in red. (24 Oct 2026) |
| D-32 | A category that has never been used can be **deleted**. One that has transactions (or a budget) can only be **archived**: hidden from pickers, history kept, so old reports stay correct. The system category Fees & Charges can be neither. (24 Oct 2026) |
| D-33 | A transfer between accounts in **different currencies** (e.g. USD Cash → GHS Bank) records the **amount sent and the amount received**, as they really happened. The app shows the rate this implies; it does not calculate either amount. (24 Oct 2026) |
| D-34 | The weekly email is sent with **Resend's test sender** for now: free, no domain needed, and it can only email the account owner's own address. A custom domain can come later. (24 Oct 2026) |
| D-35 | **Exchange rates come from `open.er-api.com`** (answers Q-5). Tested 24 Oct 2026: it returns GHS (USD 1 = GHS 11.671489), updates once a day just after 00:00 UTC, needs no key, and asks for attribution ("Rates by Exchange Rate API"), shown next to the rate. A rate is stored under the provider's own update date. The daily job fetches it; if the service is down, M-6 applies. (24 Oct 2026) |
| D-36 | **A GHS expense or income on a USD account**: the amount leaving (or entering) the account is suggested as GHS ÷ that date's USD rate, rounded by the same M-4 rounding, and can be corrected like any account amount (M-7). The transaction itself stays GHS with `fx_rate = 1`. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-37 | **The total balance converts USD balances to GHS** at the latest stored rate and names that rate's date. With no stored rate, USD balances are shown separately, as before. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-38 | **A recurring transfer** moves money between two accounts **in the same currency**, without a fee. Between currencies the amount received is only known when it happens (D-33), so such a transfer is entered by hand. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-39 | **Pausing a recurring item** stops it. Resuming it continues from the next date on or after today; the dates missed while it was paused are **not** created. "Skip the next" moves the next date on by one occurrence. A new or changed item starts from its start date or today, whichever is later: older dates are not created automatically. A recurring item is created by the daily job (07:00), so one due today appears after the next run. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-40 | **A recurring goal contribution** (§6.6 `goal_id`) is in GHS, like the goal, and has no account or category: a goal is a label (D-24). The daily job adds a contribution for each date. While the goal is archived, its dates pass without a contribution, as if paused (D-39); restoring the goal continues from the next date on or after today, even if the daily job missed a run. It does not stop by itself when the target is reached. A goal with a recurring item cannot be deleted; delete the item first, or archive the goal. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-41 | **Report details §7 leaves open.** (1) An average needs history: its first week or month must start on or after the user's first transaction, otherwise "not enough history yet". (2) "Least spent on" is shown only when at least 2 categories have spending. (3) Percentages are whole numbers (saved %, changes, S-2, S-3, S-6); share % has 1 decimal. Fees are Fees & Charges and its sub-categories. (4) A custom report shows the budgets of the month of its last day; a year report has no budget section. (5) S-3 checks top-level and sub-categories against the week's or month's own average, and skips a category whose average is 0. (6) S-4 and S-8 are for weekly reports; S-8 counts days up to yesterday, from the user's first transaction. (7) S-5: needed per week = what is left ÷ the weeks left (part weeks count as a week), rounded by M-4; "recent" = the last 4 weeks ÷ 4; a reached goal or one past its date needs nothing. (8) S-6 is for a finished week or month with some spending. (9) S-7 names the goal with the soonest date that still needs money. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-42 | **The weekly email** is on unless the user turns it off (More → Weekly email). It goes to the sign-in address: with Resend's test sender (D-34) no other address works, so `settings` has no email column yet. The theme stays a setting of the device (built in step 1), not a `settings` column. The daily job sends last week's email on any day until it is logged as sent, so a missed or failed Monday is sent on the next run. The email is plain HTML written in code, not a React Email template (one less library). Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-43 | **Receipt photos** are added on the transaction's own page (Activity → the item → Receipt), after it is saved: the Add form has no photo field. Any transaction may have one, transfers too. Removing a photo asks first. When a transaction is deleted, its photo is removed once the 10-second Undo has passed (so Undo brings the photo back); if the browser is closed within those 10 seconds, the private photo stays in storage. Chosen during the autonomous build; to be confirmed by the developer. (24 Oct 2026) |
| D-44 | **A sub-category can be deleted even when it has been used.** Its transactions and recurring items move to its parent category, and its own budgets are removed; then it is deleted, all in one step (`delete_sub_category`). Totals for the parent, account balances and the parent's budget stay correct; reports, the PDF and Excel then show that spending under the parent, without the sub-category's detail or budget line. The confirm box says this first. A top-level category still follows D-32. This changes D-32 for sub-categories only. Asked for by the developer in manual testing. (25 Oct 2026) |
| D-45 | **Invite-only sign-up.** The sign-in page links to "Create an account" (`/sign-up`), which asks for email, password (8–72 characters, typed twice) and an **invite code**, the server-only variable `SIGNUP_INVITE_CODE` (16+ characters; without it, sign-up is closed and the link is hidden). Public sign-up **stays off** in Supabase (rule 5): the Server Action checks the code (constant time), then creates the account with the secret key (`auth.admin.createUser`, email marked confirmed), signs the person in and opens Home. So the secret key is now used in **two** places without a signed-in user: the cron route and this action, and only after the code matched (changes rule 1). Each user sees only their own data (RLS). Until a domain is verified in Resend, the Monday email reaches only the Resend account owner (D-34), so invited users should turn it off. Asked for by the developer. (25 Oct 2026) |
| D-47 | **Profile button and Settings page.** A round profile button (the first letter of the sign-in email, until a photo is added) sits at the top right of every signed-in page. It opens a menu: who is signed in, **Settings** and **Sign out**. The new **Settings** page holds the account, the weekly email switch and the theme, which move there from More (this changes where D-42 and the theme switch live; how they work is unchanged), plus Sign out. More keeps Accounts, Categories, Recurring, Budgets & goals and the backup, and gains a Settings link. On narrow screens a page's own header buttons move to a second row instead of cutting the title. Asked for by the developer. (25 Oct 2026) |

## 3. What is in version 1, and what is not

**In version 1 (all must work before release):**
accounts, transactions (expense / income / transfer), USD with automatic rates,
two-level categories, fees, optional receipts, recurring transactions, monthly
budgets, savings goals, weekly / monthly / custom / year reports, rule-based
suggestions, Monday email with PDF attached, Excel and PDF download, PWA,
light and dark mode.

**Version 2 (do not build now, do not "prepare" for it):**
statement import (CSV / Excel), AI suggestions, any other currency, sharing
with another person, offline mode, WhatsApp delivery.

## 4. Architecture

```
 Phone / laptop browser (PWA)
        │  HTTPS
        ▼
 Next.js app on Vercel
   ├─ Pages (Server Components) ── read data with the user's login
   ├─ Server Actions ──────────── add / edit / delete, validated with Zod
   ├─ /api/report.pdf ─────────── builds the PDF file
   ├─ /api/export.xlsx ────────── builds the Excel file
   └─ /api/cron/daily ─────────── runs once a day (Vercel Cron)
          │  1. fetch today's USD→GHS rate
          │  2. create due recurring transactions
          │  3. on Mondays: build last week's report, email it with the PDF
        ▼
 Supabase (London region)
   ├─ PostgreSQL + Row-Level Security
   ├─ Auth (email + password)
   └─ Storage: private "receipts" bucket
        ▲
 Resend (email)        Exchange-rate API (free, no key)
```

### Why these pieces

| Choice | Why |
|---|---|
| **Next.js + Supabase + Vercel** | You know them from GPIS. All three have free plans that are enough for one person. |
| **Row-Level Security even for one user** | The database is on the internet. RLS means that even if a bug sends the wrong query, the database only returns rows that belong to the signed-in user. It costs very little to add. |
| **One daily cron job** | Vercel's free plan allows cron jobs that run about once a day. One job does all three daily tasks, in order. Each task is safe to run twice (see 6.6), so a retry never creates duplicates. |
| **Reports calculated in TypeScript, not stored** | One person creates a few thousand transactions a year. That is small enough to load the rows for a period and calculate the report in code. The report logic is then **pure functions** with no database, which are easy to test with Vitest. |
| **PDF made on the server** (`@react-pdf/renderer`) | You asked for a real downloadable file (D-20). The Monday email also needs a PDF to attach. One function builds it for both. |
| **Excel with `exceljs`** | It is well maintained and runs on the server. (The `xlsx` package on npm is outdated.) |
| **Resend for email** | Simple API and a free plan. It works with React Email templates, so the email is written in the same style as the app. |

### Security rules (same spirit as GPIS)

1. The Supabase **secret key** is used in only one place: the cron route, which
   runs on the server without a signed-in user. (Since D-45, also the invite
   sign-up action, after the invite code matched.) It lives in a server-only module
   (`import "server-only"`) and in a Vercel environment variable — never in
   code, never in the browser.
2. The cron route checks a `CRON_SECRET` header. Without it, the route returns 401.
3. Every table has RLS on, with a policy `user_id = auth.uid()`.
4. Validation happens three times: in the form (Zod), in the Server Action
   (the same Zod schema), and in the database (CHECK constraints).
5. **Public sign-up is turned off** after you create your account, so nobody
   else can register. (You do this in the Supabase dashboard; it is a project
   setting, not code.) Invited people sign up through the app instead (D-45).
6. Every schema change is a migration file in `supabase/migrations/`.

## 5. Money rules

These rules exist because money bugs are silent: the screen looks fine and the
number is wrong.

| Rule | Detail |
|---|---|
| **M-1 Whole numbers only** | Amounts are stored as **integers in the smallest unit**: pesewas for GHS, cents for USD. GHS 12.50 is stored as `1250`. Decimal (floating-point) numbers are never used for money: in JavaScript, `0.1 + 0.2` is not `0.3`. |
| **M-2 Rates are stored with the transaction** | A USD transaction stores the rate used and the GHS value at the moment it was saved. If the rate changes tomorrow, last week's report does **not** change. |
| **M-3 Rate meaning** | `fx_rate` = how many GHS for 1 unit of the transaction's currency. GHS transactions always have `fx_rate = 1`. |
| **M-4 Rounding** | GHS value = amount × rate, rounded to the nearest pesewa (half away from zero). This happens in one function only, used everywhere. |
| **M-5 Which rate is used** | A new transaction uses the stored rate for its date. If there is no rate for that date (for example a back-dated entry), it uses the latest earlier rate and shows "rate from <date>". You can always type your own rate (`fx_source = 'manual'`). |
| **M-6 If the rate service is down** | The app keeps working. It uses the latest stored rate and shows a warning. If no rate has ever been stored, you must type one in before saving a USD transaction. |
| **M-7 What leaves the account** | Each transaction also stores the amount in the **account's** currency. Example: Netflix costs USD 9.99, but your GHS Visa card is charged GHS 153.85. The original USD 9.99 is kept as evidence, and the card balance goes down by GHS 153.85. If the bank's real charge is different, you can correct it. |
| **M-8 Balances are calculated, never stored** | Account balance = opening balance + income − expenses − transfers out + transfers in, counting only transactions on or after the opening date (D-30). A stored balance would drift away from the transactions sooner or later. |
| **M-9 Display** | Amounts display as `GHS 1,234.56` / `USD 9.99`, with tabular numbers so digits line up. The time zone is Africa/Accra. |

## 6. Data model

All tables have `user_id uuid not null default auth.uid()`, plus `created_at`
and `updated_at`. RLS is on for every table.

### 6.1 `accounts`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | 1–60 characters, unique per user |
| type | text | `cash`, `bank`, `mobile_money`, `card` |
| currency | char(3) | `GHS` or `USD` — cannot change after the first transaction |
| opening_balance_minor | bigint | balance on `opening_balance_on`; may be negative (D-29) |
| opening_balance_on | date | the day the opening balance was true; default today (D-30) |
| archived_at | timestamptz | hidden from pickers; history is kept |

### 6.2 `categories`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| kind | text | `expense` or `income` |
| parent_id | uuid null | null = top level. A sub-category's parent must be top level and of the same kind (trigger). Only two levels. |
| name | text | unique within the same parent |
| system_key | text null | `fees` marks Fees & Charges, so transfer fees always find it. A system category cannot be deleted. |
| sort_order | int | |
| archived_at | timestamptz | |

**Starter list** (you can edit it after setup):
Food (Groceries, Eating out) · Transport (Trotro & taxi, Fuel, Ride-hailing) ·
Housing (Rent, Repairs) · Utilities (Electricity, Water, Gas) ·
Data & Airtime · Family support · Church & Tithe · Health ·
Personal care · Clothing · Entertainment (Streaming, Outings) · Education ·
Gifts given · **Fees & Charges** (system) · Other.
Income: Salary · Other income.

### 6.3 `transactions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| kind | text | `expense`, `income`, `transfer` |
| occurred_on | date | the day it happened (Accra date) |
| account_id | uuid | for a transfer: the account the money comes **from** |
| category_id | uuid null | required for expense/income; must be null for a transfer; its kind must match |
| amount_minor | bigint | > 0. The original amount, as on the receipt (evidence — M-2) |
| currency | char(3) | the original currency |
| fx_rate | numeric(14,6) | GHS per 1 unit of `currency` (M-3); `1` when GHS |
| fx_source | text | `none` (GHS), `auto`, `manual` |
| fx_rate_date | date null | the date of the rate used |
| amount_ghs_minor | bigint | GHS value, frozen when saved (M-2). Reports use this. |
| account_amount_minor | bigint | amount in the account's currency (M-7) |
| to_account_id | uuid null | transfer only; must be different from `account_id` |
| to_amount_minor | bigint null | transfer only; amount received, in the to-account's currency |
| parent_transaction_id | uuid null | links a fee expense to its transfer |
| recurring_rule_id | uuid null | set when created by a recurring rule |
| occurrence_date | date null | which repeat of the rule this is |
| note | text | 0–200 characters |
| receipt_path | text null | path in the private `receipts` bucket |

Database rules (CHECK constraints and triggers):
- `kind = 'transfer'` ⇔ `to_account_id` and `to_amount_minor` are set and `category_id` is null.
- `currency = 'GHS'` ⇒ `fx_rate = 1`.
- `unique (recurring_rule_id, occurrence_date)` — a recurring item can never be created twice (6.6).
- The category's `kind` must equal the transaction's `kind`.

**A transfer with a fee** is saved as two rows in one database transaction:
the transfer itself, and an expense in Fees & Charges (from the same account)
whose `parent_transaction_id` points to the transfer. Deleting the transfer
deletes its fee.

### 6.4 `fx_rates` (shared reference data)

| Column | Type | Notes |
|---|---|---|
| rate_date | date | primary key, with base + quote |
| base / quote | char(3) | `USD` / `GHS` |
| rate | numeric(14,6) | > 0 |
| source | text | the service name |
| fetched_at | timestamptz | |

Signed-in users can only read this table. Only the cron job writes to it.

### 6.5 `budgets`

| Column | Type | Notes |
|---|---|---|
| category_id | uuid | an expense category, top level or sub-category (D-25) |
| effective_from | date | always the 1st of a month |
| amount_minor | bigint | ≥ 0, GHS per month |

The budget for a month is **the latest row whose `effective_from` is on or
before that month**. You set Food = 2,000 once, and it applies every month
until you change it. Changing it in November does not rewrite October's
history. `unique (category_id, effective_from)`.

Sub-category budgets (D-25): optional. For any month, the sub-category budgets
of a parent may not add up to more than the parent's budget. A sub-category
budget needs a parent budget. The Server Action checks this, and a database
trigger enforces it. A sub-category with no budget of its own simply counts
towards the parent.

### 6.6 `recurring_rules`

| Column | Type | Notes |
|---|---|---|
| kind, account_id, category_id, amount_minor, currency, note, to_account_id | | the template for the transaction to create |
| goal_id | uuid null | for `kind = 'goal_contribution'`: creates a goal contribution instead of a transaction (6.7) |
| frequency | text | `weekly` or `monthly` |
| weekday / day_of_month | int | which day. A monthly rule on the 31st runs on the last day of shorter months. |
| starts_on / ends_on | date | `ends_on` is optional |
| next_run_on | date | the next date to create |
| paused | bool | |

How it runs: each day, the cron job finds rules with `next_run_on <= today`,
creates the transaction (a USD item uses that day's rate), and moves
`next_run_on` forward. If the job misses a day, the next run catches up on all
missed dates. Because of `unique (recurring_rule_id, occurrence_date)`, running
it twice never makes a duplicate.

### 6.7 Savings goals

A goal is a **label** (D-24): the money stays in whatever account it is in.

`goals`

| Column | Type | Notes |
|---|---|---|
| name | text | unique per user |
| target_minor | bigint | > 0, GHS |
| target_date | date | |
| archived_at | timestamptz | |

`goal_contributions`

| Column | Type | Notes |
|---|---|---|
| goal_id | uuid | |
| occurred_on | date | |
| amount_minor | bigint | not 0. Negative means taking money back out of the goal. |
| note | text | optional |

Progress = sum of contributions. A contribution is **not** a transaction: it
does not change any account balance or the spending total. A recurring rule
can add a contribution every week (for example "GHS 180 to Emergency fund
every Monday", mockup 7).

### 6.8 `settings` and `report_emails`

- `settings`: one row per user — weekly email on/off, email address, theme.
- `report_emails`: (user_id, week_start) primary key, sent_at, status. This
  log stops the same week's email being sent twice.

### 6.9 Receipts (Storage)

- Private bucket `receipts`, path `{user_id}/{transaction_id}.jpg`.
- Before upload, the photo is shrunk in the browser to about 1600 px and saved
  as JPEG (most phone photos are 3–5 MB; this makes them about 300 KB).
- Maximum 5 MB after shrinking. Images only.
- The photo is shown through a signed URL that expires after a few minutes.
  It is never public.
- Deleting a transaction deletes its receipt.

## 7. Reports

All reports use one engine: `buildReport(input) → Report`, a pure function in
`src/lib/reports/`. The screens, the PDF, the Excel file and the email all use
its output, so they can never disagree.

### 7.1 Definitions

| Term | Exact meaning |
|---|---|
| **Spending** | Sum of `amount_ghs_minor` for **expense** rows in the period. Fees are included (they are expenses). Transfers are **not** included. |
| **Income** | Sum of `amount_ghs_minor` for income rows. |
| **Net** | Income − Spending. |
| **Saved %** | Net ÷ Income. Shown as "—" when income is 0. |
| **Most spent on** | The top-level expense category with the highest spending. If two are equal, both are named. |
| **Least spent on** | The top-level category with the lowest spending **above zero**. Categories with no spending are not "least"; they are simply not listed. |
| **Biggest expense** | The single expense row with the highest GHS value. |
| **Busiest day** | The day with the highest spending, and how many expenses it had. |
| **Share %** | Category spending ÷ total spending, to 1 decimal place. |

### 7.2 Periods and comparisons

| Period | Range | Compared with | Chart |
|---|---|---|---|
| Week | Mon–Sun | the previous week, and the **average of the 4 weeks before it** | 7 days |
| Month | 1st – last day | the previous month, and the average of the 3 months before it | one bar per day |
| Custom | any start and end (max 366 days) | the previous period of the same length | per day if ≤ 62 days, otherwise per week |
| Year | 1 Jan – 31 Dec | the previous year | 12 months |

If there is not enough history yet (for example only 2 weeks of data), the
average shows "not enough history yet" instead of a misleading number.

### 7.3 Budget status in a report

- Budgets are monthly (D-16). A weekly report shows **month-to-date** progress
  for the month that contains the week's last day (Sunday). Example: the week
  28 Sep – 4 Oct shows October budgets.
- **Pace** = day of the month ÷ days in the month (the line on the budget bars).
- Status:
  - **Over** — spent > budget (red)
  - **Watch** — spent ≥ 90% of budget, or more than 15 points ahead of pace (amber)
  - **OK** — everything else

### 7.4 Suggestion rules (version 1)

Each rule is a small function: it looks at the report and either returns a
sentence or nothing. All thresholds live in one file
(`src/lib/reports/thresholds.ts`), so changing "30%" is a one-line change.
The report shows at most **5** suggestions, in the priority order below.

| # | Rule | Fires when | Example text |
|---|---|---|---|
| S-1 | Over budget | a category's month-to-date spending > budget | "Entertainment is over budget by GHS 40.00 for October." |
| S-2 | Near budget | ≥ 90% used and ≥ 5 days left in the month | "Data & Airtime is at 91% of its October budget with 13 days left." |
| S-3 | Spending jump | a category or sub-category is ≥ 30% **and** ≥ GHS 50 above its 4-week average | "Eating out was GHS 232.00, 48% above your 4-week average (GHS 157.00)." |
| S-4 | Fees adding up | fees ≥ GHS 20 or ≥ 5 fee items in the week | "9 transfers cost GHS 32.50 in fees. Fewer, larger transfers could save money." |
| S-5 | Goal behind | a goal needs more per week than its recent average to reach its target date | "New laptop needs GHS 245 a week to reach GHS 8,000 by 31 Mar." |
| S-6 | Good week | spending ≤ 90% of the 4-week average | "You spent 12% less than your 4-week average. Well done." |
| S-7 | Saving opportunity | saved % ≥ 50% and a goal exists | "You kept 72% of this week's income. Moving GHS 1,000 to Emergency fund keeps it on track." |
| S-8 | Missing days | no transactions on 3 or more days of the week | "Nothing was recorded on Tue, Wed and Thu. Did you forget some spending?" |

Suggestions are worded as facts plus one possible action. They never shame,
and they never invent numbers that are not in the report.

## 8. Screens

Each screen matches the mockup with the same number.

| # | Screen | Main actions |
|---|---|---|
| 1 | Home | balance, this week in/out/net, report card, budget warnings, today's items |
| 2 | Add / edit transaction | Expense · Income · Transfer; GHS/USD; rate shown and editable; category; account; date; note; receipt; repeat |
| 3 | Activity | list grouped by day; search; filters; edit; delete; Excel download |
| 4 | Accounts | balances; add/archive an account; transfer with an optional fee |
| 5 | Reports | Week / Month / Custom / Year; previous/next; Download PDF; Excel |
| 6 | Budgets & goals | monthly budgets with a pace line; goals with progress |
| 7 | Recurring | list; add; pause; skip the next occurrence |
| 8 | More / Settings | categories, weekly email, currency & rates, export everything, theme, password, sign out |
| 9 | Monday email | summary + budget alerts + top 3 suggestions + PDF attached |
| 10 | PDF | A4 portrait, same numbers as screen 5 |
| — | Sign in, reset password | standard Supabase email + password |
| — | First-run setup | create accounts with opening balances; accept or edit the starter categories |

Interface rules: built for a **360 px wide** phone first; touch targets at
least 44 × 44 px; nothing is removed on small screens; no other UI library
besides shadcn/ui; Lucide icons only.

## 9. Project structure

```
expense-tracker/
├─ docs/
│  └─ DESIGN.md                 ← this file
├─ supabase/
│  ├─ migrations/               ← every schema change
│  └─ seed.sql                  ← starter categories (local development only)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/sign-in/
│  │  ├─ (app)/                 ← signed-in pages: home, activity, add, accounts,
│  │  │                            reports, budgets, recurring, settings
│  │  └─ api/
│  │     ├─ cron/daily/route.ts
│  │     ├─ report.pdf/route.ts
│  │     └─ export.xlsx/route.ts
│  ├─ components/               ← shadcn/ui + our own components
│  ├─ lib/
│  │  ├─ money.ts               ← minor units, rounding, formatting (M-1, M-4, M-9)
│  │  ├─ fx.ts                  ← rate lookup and fetch (M-5, M-6)
│  │  ├─ reports/               ← buildReport, rules, thresholds (pure, tested)
│  │  ├─ pdf/                   ← the PDF document
│  │  ├─ email/                 ← the email template
│  │  └─ supabase/              ← clients (browser, server, server-only admin)
│  └─ config/app.ts             ← app name, time zone, week start
└─ tests/                       ← Vitest unit tests; a few Playwright flows
```

## 10. Testing

| Area | How |
|---|---|
| `money.ts` | unit tests for rounding, conversion and formatting (including 0, very large amounts, and USD → GHS) |
| `reports/` | unit tests with small fixed data sets: totals, ties, empty weeks, a week crossing a month boundary, not enough history, each suggestion rule firing and not firing |
| Recurring | runs twice → no duplicates; a missed day → catch-up; the 31st in February |
| Database | RLS: a second test user cannot read the first user's rows; constraints reject bad rows |
| End to end (Playwright) | sign in → add an expense in USD → it appears in the report → download the PDF |

Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 11. Build order

You release once (D-23), but we build in this order so that every step stands
on tested ground:

1. **Setup** — Next.js, Tailwind, shadcn/ui, Supabase clients, sign-in, app shell with the bottom menu, PWA manifest, CI (lint + types + tests).
2. **Money core** — `money.ts` with tests; accounts; first-run setup.
3. **Categories** — starter list, two levels, edit/archive.
4. **Transactions** — add / edit / delete expense and income in GHS; Activity list.
5. **USD** — `fx_rates`, the daily rate fetch, rate shown and editable on the form.
6. **Transfers + fees.**
7. **Recurring** — rules + the daily cron.
8. **Budgets + goals.**
9. **Report engine** — `buildReport` + suggestion rules, test-first.
10. **Report screens** — week, month, custom, year.
11. **PDF + Excel.**
12. **Weekly email.**
13. **Receipts.**
14. **Polish + release check** — dark mode, empty states, error messages, phone testing on your own device, a backup export.

## 12. Open questions

Q-1 to Q-4 are answered: see D-24 to D-27. Q-5 (exchange-rate source) is
answered by D-35. There are no open questions.

## 13. Costs and limits

| Service | Plan | Notes |
|---|---|---|
| Vercel | Hobby (free) | Cron jobs on the free plan run about once a day, at an approximate time. That is enough here: the Monday email may arrive some time between 07:00 and 08:00. Check Vercel's current limits before step 7. |
| Supabase | Free | A free project **pauses after about a week with no activity**. Daily use prevents this. The free plan has no automatic backups, so the Excel "export everything" is your backup — download it monthly. |
| Resend | Free | Far more emails than one weekly report needs. Needs a verified sender domain, or Resend's test sender for your own address. |
| Exchange-rate API | Free | No key; the provider asks for attribution, which goes on the Settings → Currency screen. |

## 14. Risks

| Risk | What we do |
|---|---|
| The rate service changes or stops | Rates are stored daily; the app falls back to the last rate or manual entry (M-6). The fetch code is in one file, so changing provider is small. |
| The cron job does not run one day | Recurring catches up on the next run (6.6). The Monday email is logged (6.8), so a late run still sends it once. |
| Money rounding errors | Integers only (M-1), one rounding function (M-4), unit tests. |
| A big version 1 delays release | The build order (section 11) keeps every step finished and tested, so progress is visible even before release. |
