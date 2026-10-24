import "server-only";

import { requireUser } from "@/lib/auth";
import { RECEIPT_BUCKET, RECEIPT_URL_SECONDS, receiptPath } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

// The transaction's receipt photo as a signed URL that expires after a few
// minutes (§6.9), or null when it has none. Also the user's id, which the
// browser needs for the upload path.
export async function getReceipt(transactionId: string): Promise<{ userId: string; url: string | null }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(receiptPath(user.id, transactionId), RECEIPT_URL_SECONDS);
  // "Object not found" means no photo yet.
  return { userId: user.id, url: error ? null : data.signedUrl };
}
