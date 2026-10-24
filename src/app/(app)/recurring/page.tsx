import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { categoryPath } from "@/lib/categories";
import { dayLabel, todayInAccra } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { describeSchedule } from "@/lib/recurring";
import { cn } from "@/lib/utils";

import { getAccounts } from "../accounts/data";
import { getCategories } from "../categories/data";
import { getGoalNames } from "../goals/data";
import { getRules, type Rule } from "./data";

export const metadata: Metadata = { title: "Recurring" };

export default function RecurringPage() {
  return (
    <>
      <PageHeader
        title="Recurring"
        backHref="/more"
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href="/recurring/new">
              <Plus aria-hidden="true" />
              Add
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading recurring items…</p>}>
        <RuleList />
      </Suspense>
    </>
  );
}

async function RuleList() {
  // Checks the session first, so reading today's date below happens per
  // request (Cache Components rule).
  await requireUser();
  const today = todayInAccra();
  const [rules, accounts, categories, goals] = await Promise.all([
    getRules(),
    getAccounts(),
    getCategories(),
    getGoalNames(),
  ]);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const goalName = new Map(goals.map((goal) => [goal.id, goal.name]));
  const title = (rule: Rule) =>
    rule.kind === "transfer"
      ? `${accountName.get(rule.accountId ?? "") ?? ""} → ${accountName.get(rule.toAccountId ?? "") ?? ""}`
      : rule.kind === "goal_contribution"
        ? `To ${goalName.get(rule.goalId ?? "") ?? "a goal"}`
        : categoryPath(categories, rule.categoryId ?? "");
  const finished = (rule: Rule) => rule.endsOn !== null && rule.nextRunOn > rule.endsOn;

  if (rules.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-bold">No recurring items yet</h2>
        <p className="text-sm text-muted-foreground">
          Salary, rent, subscriptions, a regular transfer or a weekly amount towards a goal: add them once,
          and they are added for you on their dates.
        </p>
        <Button asChild className="h-11">
          <Link href="/recurring/new">Add a recurring item</Link>
        </Button>
      </section>
    );
  }

  const groups = [
    { label: null, rules: rules.filter((rule) => !rule.paused && !finished(rule)) },
    { label: "Paused", rules: rules.filter((rule) => rule.paused && !finished(rule)) },
    { label: "Ended", rules: rules.filter(finished) },
  ].filter((group) => group.rules.length > 0);

  return groups.map((group) => (
    <section key={group.label ?? "active"} className="flex flex-col gap-2" aria-label={group.label ?? "Active"}>
      {group.label ? (
        <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
      ) : null}
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {group.rules.map((rule) => (
          <li key={rule.id}>
            <Link
              href={`/recurring/${rule.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("font-semibold break-words", group.label && "text-muted-foreground")}>
                  {title(rule)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {describeSchedule(rule)}
                  {group.label ? "" : ` · next ${dayLabel(rule.nextRunOn, today)}`}
                </span>
              </span>
              <span className={cn("shrink-0 font-bold tabular-nums", rule.kind === "income" && "text-primary")}>
                {rule.kind === "income" ? "+" : rule.kind === "expense" ? "−" : ""}
                {formatMoney(rule.amountMinor, rule.currency)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ));
}
