import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ArchiveDeleteZone } from "@/components/archive-delete-zone";
import { dayLabel, todayInAccra } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { formatAmountForInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { addContribution, deleteContribution, deleteGoal, saveGoal, setGoalArchived } from "../actions";
import { ContributionForm } from "../contribution-form";
import { getGoal } from "../data";
import { GoalForm } from "../goal-form";
import { DeleteContribution } from "./delete-contribution";

export const metadata: Metadata = { title: "Goal" };

export default function GoalPage(props: PageProps<"/goals/[id]">) {
  return (
    <>
      <PageHeader title="Goal" backHref="/budgets" />
      {/* The id comes from the address (request data), so the page renders
          inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <GoalDetail params={props.params} />
      </Suspense>
    </>
  );
}

async function GoalDetail({ params }: { params: PageProps<"/goals/[id]">["params"] }) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) notFound();
  const today = todayInAccra();
  const progress = goalProgress(
    goal.contributions.map((c) => c.amountMinor),
    goal.targetMinor,
  );

  return (
    <>
      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4" aria-label="Progress">
        <span className="text-lg font-bold break-words">{goal.name}</span>
        <span className="relative h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${progress.percent}% saved`}>
          <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
        </span>
        <span className="text-sm tabular-nums">
          <span className="font-bold">{formatMoney(progress.savedMinor, "GHS")}</span> of{" "}
          {formatMoney(goal.targetMinor, "GHS")} · {progress.percent}%
        </span>
      </section>

      <h2 className="px-1 text-base font-bold">Put money towards it</h2>
      <ContributionForm action={addContribution.bind(null, goal.id)} today={today} />

      {goal.contributions.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Contributions">
          <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Contributions</h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {goal.contributions.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{dayLabel(c.occurredOn, today)}</span>
                  {c.note ? <span className="text-xs break-words text-muted-foreground">{c.note}</span> : null}
                </span>
                <span className={cn("font-semibold tabular-nums", c.amountMinor < 0 && "text-destructive")}>
                  {c.amountMinor < 0 ? "−" : "+"}
                  {formatMoney(Math.abs(c.amountMinor), "GHS")}
                </span>
                <DeleteContribution
                  label={`${formatMoney(Math.abs(c.amountMinor), "GHS")} on ${dayLabel(c.occurredOn, today)}`}
                  onDelete={deleteContribution.bind(null, c.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="px-1 pt-2 text-base font-bold">Change the goal</h2>
      <GoalForm
        action={saveGoal.bind(null, goal.id)}
        submitLabel="Save changes"
        initial={{ name: goal.name, target: formatAmountForInput(goal.targetMinor), targetDate: goal.targetDate }}
      />
      <ArchiveDeleteZone
        thing="goal"
        name={goal.name}
        archived={goal.archived}
        onArchive={setGoalArchived.bind(null, goal.id)}
        onDelete={deleteGoal.bind(null, goal.id)}
        archiveHint="Hides a finished or dropped goal. Its contributions stay."
        unarchiveHint="Shows the goal again."
      />
    </>
  );
}
