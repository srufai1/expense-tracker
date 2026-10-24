import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { todayInAccra } from "@/lib/dates";
import { goalChoices } from "@/lib/goals";

import { getFormChoices } from "../../activity/form-choices";
import { getGoalNames } from "../../goals/data";
import { saveRule } from "../actions";
import { RecurringForm } from "../recurring-form";

export const metadata: Metadata = { title: "New recurring item" };

export default function NewRecurringPage(props: PageProps<"/recurring/new">) {
  return (
    <>
      <PageHeader title="New recurring item" backHref="/recurring" />
      {/* Reads the user's accounts and today's date, so it renders inside
          a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewRule searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

// "?goal=<id>" (from a goal's page) starts a contribution to that goal.
async function NewRule({ searchParams }: { searchParams: PageProps<"/recurring/new">["searchParams"] }) {
  const [choices, goalNames, { goal: goalParam }] = await Promise.all([getFormChoices(), getGoalNames(), searchParams]);
  const goals = goalChoices(goalNames);
  const startGoal = goals.find((goal) => goal.id === goalParam)?.id ?? "";
  const today = todayInAccra();
  return (
    <RecurringForm
      action={saveRule.bind(null, null)}
      submitLabel="Save recurring item"
      categories={choices.categories}
      accounts={choices.accounts}
      goals={goals}
      initial={{
        kind: startGoal ? "goal_contribution" : "expense",
        amount: "",
        currency: "GHS",
        categoryId: "",
        goalId: startGoal,
        accountId: choices.accounts.length === 1 ? choices.accounts[0].id : "",
        toAccountId: "",
        frequency: "monthly",
        weekday: "1",
        dayOfMonth: String(Number(today.slice(8, 10))),
        startsOn: today,
        endsOn: "",
        note: "",
      }}
    />
  );
}
