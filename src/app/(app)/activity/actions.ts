"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import {
  accountCurrencyError,
  ghsTransactionRow,
  parseSnapshot,
  parseTransactionForm,
  transactionSaveError,
  type TransactionSnapshot,
} from "@/lib/transactions";

import type { TransactionFormState } from "./form-state";

const CHECK_CONNECTION = "Check your internet connection and try again.";

// The columns that put a deleted transaction back exactly (Undo, D-26).
const SNAPSHOT_COLUMNS =
  "id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note";

function failure(error: { code?: string; message: string }, values: Record<string, string>): TransactionFormState {
  const errors = transactionSaveError(error.code, error.message);
  // Otherwise shown under the pop-up title "Could not save" (D-31).
  return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
}

// Only GHS accounts until exchange rates exist (build step 5). The form
// offers only those, but this check is what counts: the account may have
// changed since the form was opened.
async function checkAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  values: Record<string, string>,
): Promise<TransactionFormState | null> {
  const { data, error } = await supabase.from("accounts").select("currency").eq("id", accountId).maybeSingle();
  if (error) return { errors: {}, formError: CHECK_CONNECTION, values };
  const errors = accountCurrencyError(data?.currency ?? null);
  return errors ? { errors, values } : null;
}

// A transaction changes the Activity list, the balances and the totals.
function refreshPages() {
  revalidatePath("/activity");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createTransaction(
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseTransactionForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const refused = await checkAccount(supabase, parsed.value.accountId, values);
  if (refused) return refused;
  const { error } = await supabase.from("transactions").insert(ghsTransactionRow(parsed.value));
  if (error) return failure(error, values);

  refreshPages();
  // Show the month of the new transaction, so it is visible straight away.
  redirect(`/activity?month=${parsed.value.occurredOn.slice(0, 7)}`);
}

export async function updateTransaction(
  id: string,
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseTransactionForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const refused = await checkAccount(supabase, parsed.value.accountId, values);
  if (refused) return refused;
  const { error, count } = await supabase
    .from("transactions")
    .update(ghsTransactionRow(parsed.value), { count: "exact" })
    .eq("id", id)
    .in("kind", ["expense", "income"]);
  if (error) return failure(error, values);
  if (count === 0) return { errors: {}, formError: "This transaction no longer exists.", values };

  refreshPages();
  redirect(`/activity?month=${parsed.value.occurredOn.slice(0, 7)}`);
}

// Deletes at once and returns what was deleted, so the page can offer
// Undo for 10 seconds (D-26). No "are you sure?" step: Undo is the safety.
export async function deleteTransaction(
  id: string,
): Promise<{ snapshot: TransactionSnapshot } | { error: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .in("kind", ["expense", "income"])
    .select(SNAPSHOT_COLUMNS);
  if (error) return { error: CHECK_CONNECTION };
  const snapshot = parseSnapshot(data[0]);
  if (!snapshot) return { error: "This transaction no longer exists." };

  refreshPages();
  return { snapshot };
}

// Undo: puts the deleted transaction back with the same id. The snapshot
// comes from the browser, so it is checked again here and by the database.
export async function restoreTransaction(value: unknown): Promise<string | undefined> {
  await requireUser();
  const snapshot = parseSnapshot(value);
  if (!snapshot) return "This transaction could not be put back.";

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert(snapshot);
  if (error) {
    // 23505: it is already back (Undo pressed twice).
    if (error.code === "23505") return undefined;
    return transactionSaveError(error.code, error.message)
      ? "Its account or category was deleted, so it cannot be put back."
      : CHECK_CONNECTION;
  }

  refreshPages();
  return undefined;
}
