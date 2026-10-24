"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { RECEIPT_BUCKET, receiptPath } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

// Removes a transaction's receipt photo. Returns an error message, or
// nothing on success (D-31 pop-up on failure).
export async function removeReceipt(transactionId: string): Promise<string | undefined> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath(user.id, transactionId)]);
  if (error) return "Check your internet connection and try again.";
  revalidatePath(`/activity/${transactionId}`);
}

// After a delete, once Undo is no longer offered (D-26, D-43): removes the
// photo, but only if the transaction is really gone.
export async function removeReceiptOfDeleted(transactionId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions").select("id").eq("id", transactionId).maybeSingle();
  if (error || data) return;
  await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath(user.id, transactionId)]);
}
