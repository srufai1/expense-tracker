"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { budgetSaveError, parseBudgetForm, type BudgetFormErrors } from "@/lib/budgets";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

const CHECK_CONNECTION = "Check your internet connection and try again.";

export type BudgetFormState = { errors: BudgetFormErrors; formError?: string; values?: Record<string, string> };

// Sets a category's budget from a month on (§6.5). A month that already has
// a row gets its amount changed; otherwise a new row starts there. The
// database checks the sub-category rule (D-25) for every month affected.
export async function saveBudget(
  categoryId: string,
  _previous: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseBudgetForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { amountMinor, effectiveFrom } = parsed.value;
  let { error } = await supabase
    .from("budgets")
    .insert({ category_id: categoryId, effective_from: effectiveFrom, amount_minor: amountMinor });
  // 23505: that month already has a row; change its amount.
  if (error?.code === "23505") {
    ({ error } = await supabase
      .from("budgets")
      .update({ amount_minor: amountMinor })
      .eq("category_id", categoryId)
      .eq("effective_from", effectiveFrom));
  }
  if (error) {
    const errors = budgetSaveError(error.code, error.message);
    return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
  }

  revalidatePath("/budgets");
  redirect("/budgets");
}
