# AGENTS.md

Instructions for AI coding agents working in this repository. `CLAUDE.md`
points here; do not repeat these rules elsewhere.

## Read first

**`docs/DESIGN.md`** is the approved design. Its decisions (D-nn), money rules
(M-n) and report definitions are the source of truth. If something you need is
not there, ask the developer — do not invent a rule. A change of plan is
recorded as a new D-nn decision, never by silently editing an old one.

## Rules

- **Money is stored as integers** in the smallest unit (pesewas / cents).
  Never use floating-point numbers for money (M-1). One rounding function,
  in `src/lib/money.ts` (M-4).
- **Balances are calculated, never stored** (M-8). Reports are calculated
  from transactions by the pure functions in `src/lib/reports/` (DESIGN §7).
- **Security:** the Supabase secret key is used only in server-only code
  that has no signed-in user (the cron route), never in the browser. Every
  table has Row-Level Security on. Every schema change is a migration in
  `supabase/migrations/`. Validate in the form, again in the Server Action,
  and with database constraints.
- **Pages that read data** call `requireUser()` (`src/lib/auth.ts`) inside a
  `<Suspense>` boundary. Never read the session at the top of a layout
  (Cache Components rule).
- **Mobile first:** design for a 360 px wide screen; touch targets at least
  44 × 44 px; nothing is hidden on small screens. Use the installed shadcn/ui
  components and Lucide icons only.
- **Do not build version 2 features** (DESIGN §3) or "prepare" for them.

## Working style

- The developer is a junior working alone and not a native English speaker.
  Use short sentences, explain *why*, and say which files and lines changed.
- Small, focused changes. One build step (DESIGN §11) per branch and pull
  request. Do not reformat or "tidy" code the task did not need.
- Before saying something works, run `npm run lint`, `npm run typecheck`,
  `npm run test` and `npm run build`. If you did not run them, say
  "not verified".
- Never read, print or write real secrets. `.env.example` holds variable
  names only.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
