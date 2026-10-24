"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import {
  goalDeleteError,
  goalSaveError,
  parseContributionForm,
  parseGoalForm,
  type ContributionFormErrors,
  type GoalFormErrors,
} from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";

const CHECK_CONNECTION = "Check your internet connection and try again.";

export type GoalFormState = { errors: GoalFormErrors; formError?: string; values?: Record<string, string> };
export type ContributionFormState = {
  errors: ContributionFormErrors;
  formError?: string;
  values?: Record<string, string>;
  // A new object after each saved contribution, so the form empties itself.
  saved?: { at: number };
};

function refreshPages() {
  revalidatePath("/budgets");
  revalidatePath("/goals", "layout");
}

// A new goal (id null) or changes to one.
export async function saveGoal(id: string | null, _previous: GoalFormState, formData: FormData): Promise<GoalFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseGoalForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const row = { name: parsed.value.name, target_minor: parsed.value.targetMinor, target_date: parsed.value.targetDate };
  const { error } = id ? await supabase.from("goals").update(row).eq("id", id) : await supabase.from("goals").insert(row);
  if (error) {
    const errors = goalSaveError(error.code);
    return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
  }
  refreshPages();
  redirect("/budgets");
}

// Money put into the goal, or taken out (negative). It changes no account
// balance and no spending total (D-24).
export async function addContribution(
  goalId: string,
  _previous: ContributionFormState,
  formData: FormData,
): Promise<ContributionFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseContributionForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { error } = await supabase.from("goal_contributions").insert({
    goal_id: goalId,
    occurred_on: parsed.value.occurredOn,
    amount_minor: parsed.value.amountMinor,
    note: parsed.value.note,
  });
  if (error) return { errors: {}, formError: CHECK_CONNECTION, values };
  refreshPages();
  return { errors: {}, saved: { at: Date.now() } };
}

export async function deleteContribution(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("goal_contributions").delete().eq("id", id);
  if (error) return CHECK_CONNECTION;
  refreshPages();
  return undefined;
}

// Archive hides a finished goal; its history stays. Returns an error
// message, or redirects on success.
export async function setGoalArchived(id: string, archived: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return CHECK_CONNECTION;
  refreshPages();
  redirect("/budgets");
}

// Deletes a goal without contributions; one with contributions is archived.
export async function deleteGoal(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return goalDeleteError(error.code);
  refreshPages();
  redirect("/budgets");
}
