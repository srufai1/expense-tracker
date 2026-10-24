import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { budgetLines, spendingByCategory } from "@/lib/budgets";
import { formatMonth, monthBounds, todayInAccra } from "@/lib/dates";
import { formatRateDate } from "@/lib/fx";
import { goalProgress } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { getTransactionsBetween } from "../activity/data";
import { getCategories } from "../categories/data";
import { getGoals, type Goal } from "../goals/data";
import { BudgetBar } from "./budget-bar";
import { getBudgetRows } from "./data";

export const metadata: Metadata = { title: "Budgets & goals" };

export default function BudgetsPage() {
  return (
    <>
      <PageHeader title="Budgets & goals" backHref="/more" />
      {/* Reads the session and today's date, so it renders per request
          inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading budgets…</p>}>
        <Budgets />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading goals…</p>}>
        <Goals />
      </Suspense>
    </>
  );
}

async function Budgets() {
  await requireUser();
  const today = todayInAccra();
  const month = today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const [categories, rows, transactions] = await Promise.all([
    getCategories(),
    getBudgetRows(),
    getTransactionsBetween(first, today < last ? today : last),
  ]);
  const spending = spendingByCategory(
    transactions.map((t) => ({ kind: t.kind, categoryId: t.category_id, amountGhsMinor: t.amount_ghs_minor })),
    categories,
  );
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = Number(last.slice(8, 10));
  const lines = budgetLines(categories, rows, spending, month, dayOfMonth);
  const budgeted = new Set(lines.map((line) => line.categoryId));
  const others = categories
    .filter((c) => c.kind === "expense" && c.parentId === null && !c.archived && !budgeted.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="budgets-heading">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="budgets-heading" className="text-lg font-bold">
          {formatMonth(month)}
        </h2>
        <span className="text-xs text-muted-foreground">
          Day {dayOfMonth} of {daysInMonth}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          No budgets yet. Choose a category below to give it a monthly budget.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {lines.map((line) => (
            <li key={line.categoryId}>
              <BudgetBar line={line} />
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 ? (
        <details className="rounded-2xl border bg-card">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">
            Set a budget for another category
          </summary>
          <ul className="divide-y border-t">
            {others.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/budgets/${category.id}`}
                  className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="flex-1">{category.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

async function Goals() {
  const goals = await getGoals();
  const active = goals.filter((goal) => !goal.archived);
  const archived = goals.filter((goal) => goal.archived);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="goals-heading">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="goals-heading" className="text-lg font-bold">
          Goals
        </h2>
        <Button asChild variant="outline" className="h-11">
          <Link href="/goals/new">
            <Plus aria-hidden="true" />
            Add goal
          </Link>
        </Button>
      </div>
      {active.length === 0 ? (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          A goal is a label for money you are saving. The money stays in its account; you note what you put
          towards it.
        </p>
      ) : (
        <GoalList goals={active} />
      )}
      {archived.length > 0 ? (
        <>
          <h3 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Archived</h3>
          <GoalList goals={archived} muted />
        </>
      ) : null}
    </section>
  );
}

function GoalList({ goals, muted = false }: { goals: Goal[]; muted?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {goals.map((goal) => {
        const progress = goalProgress(
          goal.contributions.map((c) => c.amountMinor),
          goal.targetMinor,
        );
        return (
          <li key={goal.id}>
            <Link
              href={`/goals/${goal.id}`}
              className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("min-w-0 font-bold break-words", muted && "text-muted-foreground")}>{goal.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">by {formatRateDate(goal.targetDate)}</span>
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${progress.percent}% saved`}>
                <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(progress.savedMinor, "GHS")} of {formatMoney(goal.targetMinor, "GHS")} · {progress.percent}%
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
