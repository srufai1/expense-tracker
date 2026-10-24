# Expense Tracker

A personal web app to record income and spending (GHS and USD) and get a
report every week. It installs on a phone's home screen (PWA).

- **Design and decisions:** [`docs/DESIGN.md`](docs/DESIGN.md)
- **Instructions for AI agents:** [`AGENTS.md`](AGENTS.md)

## Status

| Build step (DESIGN §11) | State |
|---|---|
| 1. Setup — Next.js, sign-in, app shell, PWA manifest, CI | done |
| 2. Money core — `money.ts`, accounts, first-run setup | done |
| 3–14 | not started |

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

3. Create your user: Supabase → **Authentication → Users → Add user**
   (email + password, tick "Auto confirm"). Then turn off public sign-ups:
   **Authentication → Sign In / Providers → "Allow new users to sign up"**
   off, so nobody else can register (DESIGN §4, rule 5).

4. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## Database changes (migrations)

Every change to the database is a file in `supabase/migrations/`, named
`<date and time>_<what>.sql`. They are applied **in name order, once each**.

To apply a new migration to your Supabase project:

1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open the migration file in VS Code, copy all of it, paste it into the editor.
3. Click **Run**. It should say "Success. No rows returned".
4. Never run the same file twice, and never edit a file that has already run:
   a change is always a new file.

Applied so far: keep a note of the last file you ran (for example in your
password manager's notes), so you know where to continue.

| File | What it adds |
|---|---|
| `20261023120000_accounts.sql` | the `accounts` table (build step 2) |
| `20261023180000_accounts_opening_date_not_future.sql` | refuses future opening dates (D-30) |
| `20261024100000_categories.sql` | the `categories` table and the starter list (build step 3) |

The same files run in the tests (`supabase/tests/`), in PGlite, an in-memory
Postgres, so the database rules are tested on every push.

## Checks

```bash
npm run check          # all of the below, in order — run before merging
npm run lint           # code style and common mistakes
npm run typecheck      # TypeScript types (generates Next.js route types first)
npm run test           # unit tests (Vitest)
npm run test:coverage  # unit tests + fails if src/lib is under 90% covered
npm run build          # production build
```

**Automatic check before every push.** After `npm ci`, Git runs lint, the
type check and the tests before each `git push` (`.githooks/pre-push`). If
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
