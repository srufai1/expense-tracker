# Expense Tracker

A personal web app to record income and spending (GHS and USD) and get a
report every week. It installs on a phone's home screen (PWA).

- **Design and decisions:** [`docs/DESIGN.md`](docs/DESIGN.md)
- **Instructions for AI agents:** [`AGENTS.md`](AGENTS.md)

## Status

| Build step (DESIGN §11) | State |
|---|---|
| 1. Setup — Next.js, sign-in, app shell, PWA manifest, CI | done |
| 2–14 | not started |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) ·
Tailwind CSS v4 · shadcn/ui (Radix, Lucide) · Supabase (Postgres, Auth, RLS) ·
Vercel · Vitest.

## Run it on your computer

You need Node.js 22 or newer and a Supabase project.

1. Install the packages:

   ```bash
   npm install
   ```

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

## Checks

Run all four before every commit. CI runs the same on every pull request.

```bash
npm run lint        # code style and common mistakes
npm run typecheck   # TypeScript types (generates Next.js route types first)
npm run test        # unit tests (Vitest)
npm run build       # production build
```

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
