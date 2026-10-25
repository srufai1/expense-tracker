# Expense Tracker

A personal web app to record income and spending (GHS and USD) and get a
report every week. It installs on a phone's home screen (PWA).

- **Design and decisions:** [`docs/DESIGN.md`](docs/DESIGN.md)
- **Instructions for AI agents:** [`AGENTS.md`](AGENTS.md)

## Status

All 14 build steps (DESIGN §11) are built and merged. Manual testing on a
real phone and the real Supabase project comes next. Decisions D-36 to
D-43 in `docs/DESIGN.md` were made while building and still need the
developer's confirmation.

| Build step | What it gives you |
|---|---|
| 1–2 | sign-in, accounts with opening balances, first-run setup |
| 3–4 | categories (two levels), expenses and income, Activity |
| 5–6 | USD with daily exchange rates; transfers with fees |
| 7–8 | recurring items (daily job); monthly budgets and savings goals |
| 9–10 | the report engine; Reports (week, month, custom, year) and Home |
| 11 | PDF and Excel downloads; "Export everything" backup |
| 12 | the Monday email with the PDF attached |
| 13 | receipt photos |
| 14 | polish: one date format, dark mode and 360 px checks |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) ·
Tailwind CSS v4 · shadcn/ui (Radix, Lucide) · Supabase (Postgres, Auth, RLS) ·
Vercel · Vitest.

## Run it on your computer

You need Node.js 22 or newer and a Supabase project.

1. Install the packages:

   ```bash
   npm ci
   ```

   Use `npm ci`, not `npm install`, after every `git pull`. It installs
   exactly what `package-lock.json` lists and never changes that file.
   (`npm install` can rewrite the lockfile, for example when your npm
   version differs from the one that made it, and then `git pull` stops
   with "Your local changes … would be overwritten".)

2. Copy the settings template and fill it in from Supabase →
   **Project Settings → API**:

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` is ignored by Git. Never commit it.

3. Turn off public sign-ups: **Authentication → Sign In / Providers →
   "Allow new users to sign up"** off, so nobody can register directly with
   Supabase (DESIGN §4, rule 5). Then create your user, either way:
   - in the app: set `SIGNUP_INVITE_CODE` (and `SUPABASE_SECRET_KEY`) in
     `.env.local`, then use **Create an account** on the sign-in page (D-45);
   - or in Supabase → **Authentication → Users → Add user** (email +
     password, tick "Auto confirm").

4. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## Database changes (migrations)

Every change to the database is a file in `supabase/migrations/`, named
`<date and time>_<what>.sql`. They are applied **in name order, once each**.

They are applied with the Supabase CLI, which remembers which files have
run and runs only the new ones.

Once per computer (in the project folder):

```bash
npx supabase login
npx supabase link --project-ref <your project ref>
```

The project ref is in the dashboard address: `supabase.com/dashboard/project/<ref>`.
`link` asks for the database password; type it there only.

After each `git pull` that brings a new migration:

```bash
npx supabase db push --linked --dry-run   # shows what would run; changes nothing
npx supabase db push --linked             # runs it
```

Never run a migration file by hand in the SQL Editor as well: the CLI would
not know, and would run it again. Never edit a file that has already run: a
change is always a new file.

| File | What it adds |
|---|---|
| `20261023120000_accounts.sql` | the `accounts` table (build step 2) |
| `20261023180000_accounts_opening_date_not_future.sql` | refuses future opening dates (D-30) |
| `20261024100000_categories.sql` | the `categories` table and the starter list (build step 3) |
| `20261024140000_transactions.sql` | the `transactions` table and calculated balances (build step 4) |
| `20261024180000_fx_rates.sql` | stored USD→GHS exchange rates (build step 5) |
| `20261024200000_transfers.sql` | transfers with an optional fee, saved together (build step 6) |
| `20261024220000_recurring.sql` | recurring items, created by the daily job (build step 7) |
| `20261025090000_budgets_goals.sql` | monthly budgets and savings goals (build step 8) |
| `20261025110000_recurring_goals.sql` | recurring goal contributions (build step 8, D-40) |
| `20261025130000_settings_emails.sql` | weekly email on/off and the email log (build step 12) |
| `20261025150000_receipts.sql` | the private `receipts` photo bucket and its access rules (build step 13) |
| `20261025170000_delete_sub_category.sql` | deleting a used sub-category moves its transactions to the parent (D-44) |

The same files run in the tests (`supabase/tests/`), in PGlite, an in-memory
Postgres, so the database rules are tested on every push.

## Put it online (Vercel)

1. **Supabase:** run every migration (`npx supabase db push --linked`, see
   above). The receipts migration also creates the private photo bucket.
2. **Vercel:** New Project → import this GitHub repository → Deploy.
3. **Environment variables** (Vercel → Project → Settings → Environment
   Variables). Names only are in `.env.example`; never commit the values.

   | Name | Where to find it | Used by |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | the whole app |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API keys | the whole app |
   | `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API keys → Secret key | the daily job and invite sign-up |
   | `CRON_SECRET` | make one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | the daily job only |
   | `RESEND_API_KEY` | Resend → API Keys (Sending access) | the Monday email only |
   | `SIGNUP_INVITE_CODE` | make one like `CRON_SECRET`; give it to the people you invite | invite sign-up (D-45); empty = closed |

   After adding them, redeploy (Deployments → ⋯ → Redeploy).
4. **Supabase Auth URL:** Authentication → URL Configuration → Site URL =
   your Vercel address (for example `https://expense-tracker-xyz.vercel.app`).
   Under **Redirect URLs**, add `https://<your-app>.vercel.app/**` and
   `http://localhost:3000/**`: the password reset email (D-48) may only
   send people back to these addresses.
5. **The daily job** (`vercel.json`) runs once a day around 07:00 (UTC, the
   same as Accra). It fetches the exchange rate, creates recurring items and
   sends the Monday email. To run it by hand once:

   ```bash
   curl -H "Authorization: Bearer <your CRON_SECRET>" https://<your-app>.vercel.app/api/cron/daily
   ```

   It answers with what each task did, for example `{"rate": "saved …",
   "recurring": "nothing due", "email": "nothing to send for …"}`.
6. **Resend** (D-34): sign up with the **same email address you use to sign
   in to the app**. The test sender (`onboarding@resend.dev`) can only send
   to that address.
7. **Backup:** the free Supabase plan has no automatic backups. Download
   More → **Export everything (Excel)** once a month.

## Security

Checked on 25 Oct 2026, before the first deploy:

- The secret key is read in one server-only file (`src/lib/supabase/admin.ts`),
  used by the daily job and by invite sign-up after the code matched (D-45). `npm run check`, every `git push` and CI fail
  if `sb_secret_` or `service_role` appears anywhere in `src/`
  (`scripts/check-secrets.mjs`).
- Every table has Row-Level Security on, with policies for the owner only.
  The two `security definer` functions check `auth.uid()` themselves.
- Signed-out visitors are sent to sign-in, downloads included. The daily job
  answers 401 without `CRON_SECRET` (compared in constant time).
- Receipt photos are in a private bucket, shown through links that expire
  after 5 minutes.
- Every response carries security headers (`src/lib/security-headers.ts`):
  no framing by other sites, no type guessing, HTTPS only.
- `npm audit`: 2 moderate warnings, both the old `uuid` package inside
  `exceljs`. The bug needs `uuid` v3/v5/v6 with a caller-supplied buffer;
  exceljs does not use it that way, so it does not affect this app. The
  suggested `npm audit fix --force` would downgrade exceljs, so do not run it.

In the Supabase dashboard, check once:

1. **Authentication → Sign In / Providers:** "Allow new users to sign up" is
   **off** (only your own user exists).
2. **Advisors → Security Advisor:** no errors.
3. **Authentication → URL Configuration:** Site URL is the Vercel address.

## Checks

```bash
npm run check          # all of the below, in order — run before merging
npm run check:secrets  # no Supabase secret key written anywhere under src/
npm run lint           # code style and common mistakes
npm run typecheck      # TypeScript types (generates Next.js route types first)
npm run test           # unit tests (Vitest)
npm run test:coverage  # unit tests + fails if src/lib is under 90% covered
npm run build          # production build
```

**Automatic check before every push.** After `npm ci`, Git runs the
secret-key search, lint, the type check and the tests before each `git push` (`.githooks/pre-push`). If
anything fails, the push is cancelled: fix the problem and push again.

GitHub CI (`.github/workflows/ci.yml`) runs the same checks, but GitHub
Actions is currently blocked on this account by a billing lock, so the
pre-push check and `npm run check` are the safety net for now.

## Folder guide

```
src/
├─ app/
│  ├─ (auth)/sign-in/     sign-in page + Server Action
│  ├─ (app)/              signed-in pages with the bottom menu
│  └─ manifest.ts         PWA manifest
├─ components/            app-shell pieces + shadcn/ui components (ui/)
├─ config/app.ts          app name, time zone, week start, colours
├─ hooks/
├─ lib/
│  ├─ auth.ts             requireUser() — every data page calls it
│  ├─ safe-redirect.ts    keeps ?next= redirects inside the app
│  └─ supabase/           browser, server and proxy clients
└─ proxy.ts               refreshes the session; sends signed-out visitors to /sign-in
```
