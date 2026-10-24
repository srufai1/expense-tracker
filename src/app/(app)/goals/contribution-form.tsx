"use client";

import { SimpleForm } from "@/components/simple-form";
import { parseContributionForm } from "@/lib/goals";

import type { ContributionFormState } from "./actions";

// Money put towards a goal, or taken out with a minus sign (D-24). It changes
// no account balance: the money stays where it is.
export function ContributionForm({
  action,
  today,
}: {
  action: (state: ContributionFormState, formData: FormData) => Promise<ContributionFormState>;
  today: string;
}) {
  return (
    <SimpleForm
      action={action}
      check={parseContributionForm}
      initial={{ amount: "", occurredOn: today, note: "" }}
      submitLabel="Add to goal"
      resetOnSave
      fields={[
        {
          name: "amount",
          label: "Amount",
          prefix: "GHS",
          inputMode: "decimal",
          placeholder: "0.00",
          hint: "Use a minus sign to take money back out, e.g. -50. No account balance changes.",
        },
        { name: "occurredOn", label: "Date", type: "date" },
        { name: "note", label: "Note (optional)", maxLength: 200 },
      ]}
    />
  );
}
