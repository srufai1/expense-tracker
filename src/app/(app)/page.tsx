import { ChevronRight, Lightbulb, School, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { InstallAppButton } from "@/components/install-app-button";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodHref, periodTitle } from "@/lib/reports/params";
import { periodFor } from "@/lib/reports/periods";

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
      <Suspense fallback={<div className="h-40 rounded-2xl bg-muted" aria-hidden="true" />}>
        <ThisWeek />
      </Suspense>
      <Suspense fallback={null}>
        <SchoolMoneyCard />
      </Suspense>
      <InstallAppButton />
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

async function SchoolMoneyCard() {
  const held = await getHeldTotal();
  return (
    <Link
      href="/school"
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <School className="size-4 text-primary" aria-hidden="true" />
        <span>School money<span className="block text-xs font-normal text-muted-foreground">Fees, morning classes and books</span></span>
      </span>
      <span className="flex items-center gap-1">
        {held !== null ? <MoneyText minor={held} currency="GHS" className="font-bold whitespace-nowrap" /> : null}
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
        <Figure label="Income" minor={report.totals.incomeMinor} />
        <Figure label="Spending" minor={report.totals.spendingMinor} />
        <Figure label="Net" minor={report.totals.netMinor} />
        {report.totals.savedPercent !== null ? (
          <div className="flex justify-between gap-2 text-sm">
            <dt className="text-muted-foreground">Saved this week</dt>
            <dd className="font-bold tabular-nums">{report.totals.savedPercent}%</dd>
          </div>
        ) : null}
      </dl>
      <Button asChild variant="outline" className="h-11">
        <Link href="/budgets#goals-heading">Savings goals</Link>
      </Button>
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
