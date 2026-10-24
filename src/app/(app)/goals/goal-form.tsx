"use client";

import { SimpleForm } from "@/components/simple-form";
import { parseGoalForm } from "@/lib/goals";

import type { GoalFormState } from "./actions";

// A savings goal (D-24): a name, a GHS target and a date to reach it by.
export function GoalForm({
  action,
  initial,
  submitLabel,
}: {
  action: (state: GoalFormState, formData: FormData) => Promise<GoalFormState>;
  initial: { name: string; target: string; targetDate: string };
  submitLabel: string;
}) {
  return (
    <SimpleForm
      action={action}
      check={parseGoalForm}
      initial={initial}
      submitLabel={submitLabel}
      fields={[
        { name: "name", label: "Name", placeholder: "e.g. Emergency fund", maxLength: 60 },
        { name: "target", label: "Target", prefix: "GHS", inputMode: "decimal", placeholder: "0.00" },
        { name: "targetDate", label: "Reach it by", type: "date" },
      ]}
    />
  );
}
