import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { dayLabel, todayInAccra } from "@/lib/dates";
import { goalChoices } from "@/lib/goals";
import { formatAmountForInput } from "@/lib/money";

import { getFormChoices } from "../../activity/form-choices";
import { getGoalNames } from "../../goals/data";
import { deleteRule, saveRule, setRulePaused, skipNext } from "../actions";
import { getRule } from "../data";
import { RecurringForm } from "../recurring-form";
import { RuleActions } from "../rule-actions";

export const metadata: Metadata = { title: "Edit recurring item" };

export default function EditRecurringPage(props: PageProps<"/recurring/[id]">) {
  return (
    <>
      <PageHeader title="Edit recurring item" backHref="/recurring" />
      {/* The id comes from the address (request data), so the form renders
          inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <EditRule params={props.params} />
      </Suspense>
    </>
  );
}

async function EditRule({ params }: { params: PageProps<"/recurring/[id]">["params"] }) {
  const { id } = await params;
  const rule = await getRule(id);
  if (!rule) notFound();
  const accountIds = [rule.accountId, rule.toAccountId].filter((accountId) => accountId !== null);
  const [choices, goalNames] = await Promise.all([
    getFormChoices({ accountIds, categoryId: rule.categoryId ?? undefined }),
    getGoalNames(),
  ]);

  return (
    <>
      <RecurringForm
        action={saveRule.bind(null, rule.id)}
        submitLabel="Save changes"
        categories={choices.categories}
        accounts={choices.accounts}
        goals={goalChoices(goalNames, rule.goalId ?? undefined)}
        initial={{
          kind: rule.kind,
          amount: formatAmountForInput(rule.amountMinor),
          currency: rule.currency,
          categoryId: rule.categoryId ?? "",
          goalId: rule.goalId ?? "",
          accountId: rule.accountId ?? "",
          toAccountId: rule.toAccountId ?? "",
          frequency: rule.frequency,
          weekday: String(rule.weekday ?? 1),
          dayOfMonth: String(rule.dayOfMonth ?? 1),
          startsOn: rule.startsOn,
          endsOn: rule.endsOn ?? "",
          note: rule.note,
        }}
      />
      <RuleActions
        paused={rule.paused}
        nextLabel={dayLabel(rule.nextRunOn, todayInAccra())}
        onPause={setRulePaused.bind(null, rule.id)}
        onSkip={skipNext.bind(null, rule.id)}
        onDelete={deleteRule.bind(null, rule.id)}
      />
    </>
  );
}
