"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseAccountForm, type AccountInput } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

import type { AccountFormState } from "./form-state";

const CHECK_CONNECTION = "Check your internet connection and try again.";

function toRow(input: AccountInput) {
  return {
    name: input.name,
    type: input.type,
    currency: input.currency,
    opening_balance_minor: input.openingBalanceMinor,
    opening_balance_on: input.openingBalanceOn,
  };
}

// A database answer turned into a message for the form.
function failure(code: string | undefined, values: Record<string, string>): AccountFormState {
  // 23505: unique_violation — the one unique rule is the account name.
  if (code === "23505") {
    return { errors: { name: "You already have an account with this name." }, values };
  }
  // Shown under the pop-up title "Could not save" (D-31).
  return { errors: {}, formError: CHECK_CONNECTION, values };
}

function refreshAccountPages() {
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createAccount(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseAccountForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert(toRow(parsed.value));
  if (error) return failure(error.code, values);

  refreshAccountPages();
  redirect("/accounts");
}

export async function updateAccount(
  id: string,
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseAccountForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update(toRow(parsed.value), { count: "exact" })
    .eq("id", id);
  if (error) return failure(error.code, values);
  // Row-Level Security hides other users' rows, so 0 means "not yours".
  if (count === 0) return { errors: {}, formError: "This account no longer exists.", values };

  refreshAccountPages();
  redirect("/accounts");
}

// Archived accounts disappear from pickers and totals but keep their history.
// Returns an error message for the pop-up, or redirects on success.
export async function setAccountArchived(id: string, archived: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return CHECK_CONNECTION;

  refreshAccountPages();
  redirect("/accounts");
}

export async function deleteAccount(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) {
    // 23503: transactions still point at this account (ON DELETE RESTRICT).
    return error.code === "23503"
      ? "This account has transactions, so it cannot be deleted. Archive it instead: it is hidden, and its history stays."
      : CHECK_CONNECTION;
  }

  refreshAccountPages();
  redirect("/accounts");
}
