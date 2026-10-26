import { ChevronRight, Lightbulb, Nfc, School, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { InstallAppButton } from "@/components/install-app-button";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { totalInGhs, totalsByCurrency } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodHref, periodTitle } from "@/lib/reports/params";
import { periodFor } from "@/lib/reports/periods";

import { getAccounts } from "./accounts/data";
import { getRateFor } from "./activity/rates";
import { MoneyText } from "./accounts/money-text";
import { getReport } from "./reports/data";
import { getHeldTotal } from "./school/data";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      {/* Reads the session, so it streams in behind a boundary while the
          rest of the page shows straight away. */}
      <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
        <SignedInAs />
      </Suspense>
      <Suspense fallback={<div className="aspect-[1.586] rounded-2xl bg-muted" aria-hidden="true" />}>
        <BalanceCard />
      </Suspense>
      <Suspense fallback={null}>
        <SchoolMoneyCard />
      </Suspense>
      <Suspense fallback={<div className="h-40 rounded-2xl bg-muted" aria-hidden="true" />}>
        <ThisWeek />
      </Suspense>
    </>
  );
}

async function SignedInAs() {
  const user = await requireUser();
  return (
    <p className="text-sm text-muted-foreground">
      Signed in as <span className="font-semibold text-foreground">{user.email}</span>
    </p>
  );
}

// First run: no accounts yet, so invite the user to add one. After that:
// the total balance, linking to the Accounts page, drawn like a bank card
// (card shape 85.6 × 54 mm, chip, contactless sign). The decoration is
// hidden from screen readers; they read the label and the amount.
async function BalanceCard() {
  const accounts = (await getAccounts()).filter((account) => !account.archived);

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground">
        <h2 className="text-lg font-bold">Welcome! Start with your accounts</h2>
        <p className="text-sm opacity-90">
          Add each place your money sits — cash, bank, Mobile Money, card — with its balance today.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary" className="h-11">
            <Link href="/accounts/new">Add your first account</Link>
          </Button>
          <InstallAppButton />
        </div>
      </section>
    );
  }

  const totals = totalsByCurrency(accounts);
  const hasUsd = accounts.some((account) => account.currency === "USD");
  const latest = hasUsd ? await getRateFor(todayInAccra()) : null;
  const total = totalInGhs(accounts, latest?.rate ?? null);

  return (
    // The Install button sits on the card but outside its link (a button
    // inside a link is not allowed), in the top-right corner (D-46).
    <div className="relative">
      <Link
        href="/accounts"
        className="relative isolate flex aspect-[1.586] flex-col justify-between gap-3 rounded-2xl p-5 text-white shadow-lg ring-1 ring-white/10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        {/* The card face. Its own layer, so a very large amount can make the
            card taller instead of being cut off. */}
        <span
          className="absolute inset-0 -z-10 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0E7A62] via-[#0B5D4B] to-[#06372C]"
          aria-hidden="true"
        >
          <span className="absolute -top-16 -right-12 size-56 rounded-full bg-white/10" />
          <span className="absolute -bottom-24 -left-10 size-64 rounded-full bg-white/5" />
        </span>

        <span className="flex items-center justify-between" aria-hidden="true">
          {/* The chip */}
          <span className="relative h-8 w-11 rounded-md bg-gradient-to-br from-[#F6D98B] via-[#E2B54F] to-[#B98A2A] shadow-inner">
            <span className="absolute inset-x-1.5 top-1/2 h-px bg-[#8A6418]/50" />
            <span className="absolute inset-y-1.5 left-1/2 w-px bg-[#8A6418]/50" />
          </span>
          <Nfc className="size-7 opacity-80" />
        </span>

        <span className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-80">Total balance</span>
          <MoneyText minor={total.ghsMinor} currency="GHS" className="text-3xl font-extrabold tracking-tight text-white" />
          {/* USD is shown separately only when no rate is stored to convert it (D-37). */}
          {hasUsd && !total.usdConverted ? (
            <span className="text-xs opacity-90">
              + <MoneyText minor={totals.USD} currency="USD" className="text-white" />
            </span>
          ) : null}
        </span>

        <span className="flex items-end justify-between gap-3">
          <span className="text-xs font-semibold tracking-widest uppercase opacity-80">{accounts.length} accounts</span>
          <span className="flex items-center gap-1 text-sm font-extrabold italic">
            {appConfig.name}
            <ChevronRight className="size-4 not-italic opacity-80" aria-hidden="true" />
          </span>
        </span>
      </Link>
      <InstallAppButton className="absolute top-3.5 right-14" />
    </div>
  );
}

// School money held for others (D-54): part of the balance above, but not
// the user's money. Shown once School money is set up.
async function SchoolMoneyCard() {
  const held = await getHeldTotal();
  if (held === null) return null;
  return (
    <Link
      href="/school"
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <School className="size-4 text-primary" aria-hidden="true" />
        Holding for the school
      </span>
      <span className="flex items-center gap-1">
        <MoneyText minor={held} currency="GHS" className="font-bold whitespace-nowrap" />
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Link>
  );
}

// This week at a glance (screen 1): in, out and net, today's spending,
// budget warnings and the top suggestion. The numbers come from the same
// report as the Reports screen, so the two always agree.
async function ThisWeek() {
  await requireUser();
  const today = todayInAccra();
  const period = periodFor("week", today);
  const report = await getReport(period, today);
  const todaySpent = report.chart.find((day) => day.first === today)?.spendingMinor ?? 0;
  const warnings = (report.budgets?.lines ?? []).filter((line) => line.status !== "ok");
  const tip = report.suggestions[0];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-labelledby="this-week">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="this-week" className="text-lg font-bold">
          This week
        </h2>
        <span className="text-xs text-muted-foreground">{periodTitle(period)}</span>
      </div>
      <dl className="flex flex-col gap-1">
        <Figure label="In" minor={report.totals.incomeMinor} />
        <Figure label="Out" minor={report.totals.spendingMinor} />
        <Figure label="Net" minor={report.totals.netMinor} />
      </dl>
      <Link href="/activity" className="flex min-h-11 items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Spent today</span>
        <span className="font-semibold tabular-nums">{formatMoney(todaySpent, "GHS")}</span>
      </Link>
      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t pt-3" aria-label="Budget warnings">
          {warnings.map((line) => (
            <li key={line.categoryId}>
              <Link href={`/budgets/${line.categoryId}`} className="flex min-h-11 items-center gap-2 text-sm">
                <TriangleAlert
                  className={line.status === "over" ? "size-4 shrink-0 text-destructive" : "size-4 shrink-0 text-amber-600 dark:text-amber-400"}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 break-words">
                  {line.label}: {line.status === "over" ? "over budget" : `${line.usedPercent}% used`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {tip ? (
        <p className="flex gap-2 border-t pt-3 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>{tip}</span>
        </p>
      ) : null}
      <Button asChild variant="outline" className="h-11">
        <Link href={periodHref(period)}>See the full report</Link>
      </Button>
    </section>
  );
}

function Figure({ label, minor }: { label: string; minor: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <MoneyText minor={minor} currency="GHS" className="font-bold" />
      </dd>
    </div>
  );
}
