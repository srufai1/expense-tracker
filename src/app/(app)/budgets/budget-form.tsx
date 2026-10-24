"use client";

import { SimpleForm } from "@/components/simple-form";
import { parseBudgetForm } from "@/lib/budgets";

import type { BudgetFormState } from "./actions";

// A category's monthly budget in GHS, from a month on (§6.5). 0 ends it.
export function BudgetForm({
  action,
  initial,
}: {
  action: (state: BudgetFormState, formData: FormData) => Promise<BudgetFormState>;
  initial: { amount: string; month: string };
}) {
  return (
    <SimpleForm
      action={action}
      check={parseBudgetForm}
      initial={initial}
      submitLabel="Save budget"
      fields={[
        {
          name: "amount",
          label: "Budget per month",
          prefix: "GHS",
          inputMode: "decimal",
          placeholder: "0.00",
          hint: "0 ends the budget from that month. Earlier months keep their budget.",
        },
        {
          name: "month",
          label: "From month",
          type: "month",
          hint: "It applies to this month and every month after, until you change it.",
        },
      ]}
    />
  );
}
