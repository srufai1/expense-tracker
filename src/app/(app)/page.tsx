import { ChevronRight, Lightbulb, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
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

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      {/* Reads the session, so it streams in behind a boundary while the
          rest of the page shows straight away. */}
      <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
        <SignedInAs />
      </Suspense>
      <Suspense fallback={<div className="h-32 rounded-2xl bg-muted" aria-hidden="true" />}>
        <BalanceCard />
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
// the total balance, linking to the Accounts page.
async function BalanceCard() {
  const accounts = (await getAccounts()).filter((account) => !account.archived);

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground">
        <h2 className="text-lg font-bold">Welcome! Start with your accounts</h2>
        <p className="text-sm opacity-90">
          Add each place your money sits — cash, bank, Mobile Money, card — with its balance today.
        </p>
        <Button asChild variant="secondary" className="h-11">
          <Link href="/accounts/new">Add your first account</Link>
        </Button>
      </section>
    );
  }

  const totals = totalsByCurrency(accounts);
  const hasUsd = accounts.some((account) => account.currency === "USD");
  const latest = hasUsd ? await getRateFor(todayInAccra()) : null;
  const total = totalInGhs(accounts, latest?.rate ?? null);

  return (
    <Link
      href="/accounts"
      className="flex items-center gap-3 rounded-2xl bg-primary p-5 text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-semibold opacity-90">Total balance · {accounts.length} accounts</span>
        <MoneyText
          minor={total.ghsMinor}
          currency="GHS"
          className="text-3xl font-extrabold tracking-tight text-primary-foreground"
        />
        {/* USD is shown separately only when no rate is stored to convert it (D-37). */}
        {hasUsd && !total.usdConverted ? (
          <span className="text-xs opacity-90">
            + <MoneyText minor={totals.USD} currency="USD" className="text-primary-foreground" />
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-5 opacity-80" aria-hidden="true" />
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
