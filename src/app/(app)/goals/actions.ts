"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";
import { formValues } from "@/lib/form-data";
import {
  goalDeleteError,
  goalSaveError,
  parseContributionForm,
  parseGoalForm,
  type ContributionFormErrors,
  type GoalFormErrors,
} from "@/lib/goals";
import { nextRunAfterRestore } from "@/lib/recurring";
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
  if (!archived) {
    // D-40: the dates that passed while the goal was archived are skipped,
    // even if the daily job missed a run. Done before the goal is active
    // again, so a run in between cannot add them.
    const { data: rules, error: readError } = await supabase
      .from("recurring_rules")
      .select("id, frequency, weekday, day_of_month, starts_on, next_run_on")
      .eq("goal_id", id);
    if (readError) return CHECK_CONNECTION;
    const today = todayInAccra();
    for (const rule of rules) {
      const schedule = { frequency: rule.frequency, weekday: rule.weekday, dayOfMonth: rule.day_of_month };
      const next = nextRunAfterRestore({ ...schedule, startsOn: rule.starts_on, nextRunOn: rule.next_run_on }, today);
      if (next === rule.next_run_on) continue;
      const { error: moveError } = await supabase.from("recurring_rules").update({ next_run_on: next }).eq("id", rule.id);
      if (moveError) return CHECK_CONNECTION;
    }
    revalidatePath("/recurring");
  }
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
