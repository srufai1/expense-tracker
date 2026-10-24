"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import {
  buildTransferArgs,
  parseTransferForm,
  parseTransferSnapshot,
  transferSaveError,
  type TransferFormErrors,
  type TransferSnapshot,
} from "@/lib/transfers";

import { getRateFor } from "./rates";

const CHECK_CONNECTION = "Check your internet connection and try again.";

// What a save attempt sends back to the transfer form when it fails.
export type TransferFormState = {
  errors: TransferFormErrors;
  formError?: string;
  values?: Record<string, string>;
};

// A transfer changes the Activity list and two balances.
function refreshPages() {
  revalidatePath("/activity");
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Saves a new transfer (id null) or changes to one, with its fee, in one
// database transaction (save_transfer). The accounts' currencies are read
// here, not taken from the form: they may have changed since it opened.
export async function saveTransfer(
  id: string | null,
  _previous: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseTransferForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, currency")
    .in("id", [parsed.value.fromAccountId, parsed.value.toAccountId]);
  if (accountsError) return { errors: {}, formError: CHECK_CONNECTION, values };
  const from = accounts.find((account) => account.id === parsed.value.fromAccountId);
  const to = accounts.find((account) => account.id === parsed.value.toAccountId);
  if (!from || !to) return { errors: { fromAccountId: "Choose both accounts from the list." }, values };

  const stored = from.currency === "USD" ? await getRateFor(parsed.value.occurredOn) : null;
  const built = buildTransferArgs(parsed.value, from.currency, to.currency, stored, id);
  if (!built.ok) return { errors: built.errors, values };

  const { error } = await supabase.rpc("save_transfer", built.args);
  if (error) {
    const errors = transferSaveError(error.code, error.message);
    return errors ? { errors, values } : { errors: {}, formError: CHECK_CONNECTION, values };
  }

  refreshPages();
  redirect(`/activity?month=${parsed.value.occurredOn.slice(0, 7)}`);
}

// Deletes a transfer with its fee and returns what was deleted, so the page
// can offer Undo for 10 seconds (D-26). delete_transfer() locks, reads and
// deletes in one step, so the snapshot is exactly what was deleted.
export async function deleteTransfer(id: string): Promise<{ snapshot: TransferSnapshot } | { error: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_transfer", { p_id: id });
  if (error) return { error: CHECK_CONNECTION };
  const snapshot = parseTransferSnapshot(data);
  if (!snapshot) return { error: "This transfer no longer exists." };

  refreshPages();
  return { snapshot };
}

// Undo: puts the transfer and its fee back, with the transfer's own id.
export async function restoreTransfer(value: unknown): Promise<string | undefined> {
  await requireUser();
  const snapshot = parseTransferSnapshot(value);
  if (!snapshot) return "This transfer could not be put back.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_transfer", snapshot);
  if (error) {
    return transferSaveError(error.code, error.message)
      ? "One of its accounts was deleted or changed, so it cannot be put back."
      : CHECK_CONNECTION;
  }

  refreshPages();
  return undefined;
}
