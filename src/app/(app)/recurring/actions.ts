"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";
import { formValues } from "@/lib/form-data";
import {
  firstRunOn,
  nextOccurrence,
  parseRecurringForm,
  recurringSaveError,
  type RecurringFormErrors,
} from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";

const CHECK_CONNECTION = "Check your internet connection and try again.";

export type RecurringFormState = {
  errors: RecurringFormErrors;
  formError?: string;
  values?: Record<string, string>;
};

function refreshPages() {
  revalidatePath("/recurring");
}

// Saves a new rule (id null) or changes to one. A transfer is always in the
// sending account's currency (D-38); next_run_on starts from the start date
// or today, whichever is later (D-39).
export async function saveRule(
  id: string | null,
  _previous: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseRecurringForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const input = parsed.value;

  const supabase = await createClient();
  let currency = input.currency;
  if (input.kind === "transfer") {
    const { data: from, error } = await supabase
      .from("accounts")
      .select("currency")
      .eq("id", input.accountId)
      .maybeSingle();
    if (error) return { errors: {}, formError: CHECK_CONNECTION, values };
    if (!from) return { errors: { accountId: "Choose your accounts from the list." }, values };
    currency = from.currency;
  }

  const row = {
    kind: input.kind,
    account_id: input.accountId,
    category_id: input.categoryId,
    to_account_id: input.toAccountId,
    amount_minor: input.amountMinor,
    currency,
    note: input.note,
    frequency: input.frequency,
    weekday: input.weekday,
    day_of_month: input.dayOfMonth,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    next_run_on: firstRunOn(input, input.startsOn, todayInAccra()),
  };
  const { error } = id
    ? await supabase.from("recurring_rules").update(row).eq("id", id)
    : await supabase.from("recurring_rules").insert(row);
  if (error) {
    const errors = recurringSaveError(error.code, error.message);
    return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
  }

  refreshPages();
  redirect("/recurring");
}

// Pause stops the rule. Resume continues from the next date on or after
// today; dates missed while paused are not created (D-39).
// Returns an error message, or redirects on success.
export async function setRulePaused(id: string, paused: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { data: rule, error: readError } = await supabase
    .from("recurring_rules")
    .select("frequency, weekday, day_of_month, starts_on")
    .eq("id", id)
    .maybeSingle();
  if (readError) return CHECK_CONNECTION;
  if (!rule) return "This recurring item no longer exists.";

  const schedule = { frequency: rule.frequency, weekday: rule.weekday, dayOfMonth: rule.day_of_month };
  const { error } = await supabase
    .from("recurring_rules")
    .update(paused ? { paused } : { paused, next_run_on: firstRunOn(schedule, rule.starts_on, todayInAccra()) })
    .eq("id", id);
  if (error) return CHECK_CONNECTION;
  refreshPages();
  redirect("/recurring");
}

// "Skip the next" (screen 7): the next date moves on by one occurrence.
export async function skipNext(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { data: rule, error: readError } = await supabase
    .from("recurring_rules")
    .select("frequency, weekday, day_of_month, next_run_on")
    .eq("id", id)
    .maybeSingle();
  if (readError) return CHECK_CONNECTION;
  if (!rule) return "This recurring item no longer exists.";

  const schedule = { frequency: rule.frequency, weekday: rule.weekday, dayOfMonth: rule.day_of_month };
  const { error } = await supabase
    .from("recurring_rules")
    .update({ next_run_on: nextOccurrence(schedule, rule.next_run_on) })
    .eq("id", id)
    // Only if nothing moved it meanwhile (for example the daily job).
    .eq("next_run_on", rule.next_run_on);
  if (error) return CHECK_CONNECTION;
  refreshPages();
  redirect("/recurring");
}

// Deletes the rule. Transactions it already created stay (they are history).
export async function deleteRule(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
  if (error) return CHECK_CONNECTION;
  refreshPages();
  redirect("/recurring");
}
