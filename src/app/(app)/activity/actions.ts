"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import {
  ACCOUNT_NOT_FOUND,
  buildTransactionRow,
  parseSnapshot,
  parseTransactionForm,
  transactionSaveError,
  type TransactionRow,
  type TransactionSnapshot,
} from "@/lib/transactions";

import type { TransactionFormState } from "./form-state";
import { getRateFor } from "./rates";

const CHECK_CONNECTION = "Check your internet connection and try again.";

// The columns that put a deleted transaction back exactly (Undo, D-26).
const SNAPSHOT_COLUMNS =
  "id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor, note";

function failure(error: { code?: string; message: string }, values: Record<string, string>): TransactionFormState {
  const errors = transactionSaveError(error.code, error.message);
  // Otherwise shown under the pop-up title "Could not save" (D-31).
  return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
}

// Checks the form, then builds the row from the chosen account's currency
// and the stored rate for the date (M-5, M-7, D-36). The account is read
// here, not taken from the form: it may have changed since the form opened.
async function prepareRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
): Promise<{ row: TransactionRow } | { state: TransactionFormState }> {
  const values = formValues(formData);
  const parsed = parseTransactionForm(values);
  if (!parsed.ok) return { state: { errors: parsed.errors, values } };

  const { data: account, error } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", parsed.value.accountId)
    .maybeSingle();
  if (error) return { state: { errors: {}, formError: CHECK_CONNECTION, values } };
  if (!account) return { state: { errors: ACCOUNT_NOT_FOUND, values } };

  const stored = await getRateFor(parsed.value.occurredOn);
  const built = buildTransactionRow(parsed.value, account.currency, stored);
  return built.ok ? { row: built.row } : { state: { errors: built.errors, values } };
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
  const supabase = await createClient();
  const prepared = await prepareRow(supabase, formData);
  if ("state" in prepared) return prepared.state;

  const { error } = await supabase.from("transactions").insert(prepared.row);
  if (error) return failure(error, formValues(formData));

  refreshPages();
  // Show the month of the new transaction, so it is visible straight away.
  redirect(`/activity?month=${prepared.row.occurred_on.slice(0, 7)}`);
}

export async function updateTransaction(
  id: string,
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  await requireUser();
  const supabase = await createClient();
  const prepared = await prepareRow(supabase, formData);
  if ("state" in prepared) return prepared.state;

  const { error, count } = await supabase
    .from("transactions")
    .update(prepared.row, { count: "exact" })
    .eq("id", id)
    .in("kind", ["expense", "income"]);
  if (error) return failure(error, formValues(formData));
  if (count === 0) {
    return { errors: {}, formError: "This transaction no longer exists.", values: formValues(formData) };
  }

  refreshPages();
  redirect(`/activity?month=${prepared.row.occurred_on.slice(0, 7)}`);
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
