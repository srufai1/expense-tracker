import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell/page-header";

import { saveGoal } from "../actions";
import { GoalForm } from "../goal-form";

export const metadata: Metadata = { title: "New goal" };

export default function NewGoalPage() {
  return (
    <>
      <PageHeader title="New goal" backHref="/budgets" />
      <GoalForm
        action={saveGoal.bind(null, null)}
        submitLabel="Add goal"
        initial={{ name: "", target: "", targetDate: "" }}
      />
    </>
  );
}
