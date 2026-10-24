"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseAccountForm, type AccountInput } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import type { AccountFormState } from "./form-state";

const SAVE_FAILED = "Could not save. Check your internet connection and try again.";

function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  });
  return values;
}

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
  return { errors: {}, formError: SAVE_FAILED, values };
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
  const values = typedValues(formData);
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
  const values = typedValues(formData);
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
export async function setAccountArchived(id: string, archived: boolean) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(SAVE_FAILED);

  refreshAccountPages();
  redirect("/accounts");
}

export async function deleteAccount(id: string) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(SAVE_FAILED);

  refreshAccountPages();
  redirect("/accounts");
}
