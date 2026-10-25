"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { deleteConfirmed } from "@/lib/account-deletion";
import { requireUser } from "@/lib/auth";
import { AVATAR_BUCKET, avatarPath } from "@/lib/avatar";
import { IDLE_COOKIE } from "@/lib/idle";
import { RECEIPT_BUCKET } from "@/lib/receipts";
import { isSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountState = { error?: string };

const NO_CONNECTION = "Nothing was deleted. Check your internet connection and try again.";

// "Delete my account" (D-51). In this order, so a failure leaves the account
// usable: (1) the photos (Storage files are not rows the database can
// cascade), with the user's own session; (2) the login, which takes every
// table row with it (delete_my_account); (3) this device's session cookies.
export async function deleteMyAccount(_previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (!deleteConfirmed(formData.get("confirm"))) return { error: "Type DELETE in capital letters to confirm." };

  const supabase = await createClient();
  const receipts = supabase.storage.from(RECEIPT_BUCKET);
  // Removed in batches of 100 until the folder is empty (at most 100 rounds).
  for (let round = 0; round < 100; round++) {
    const { data, error } = await receipts.list(user.id, { limit: 100 });
    if (error) return { error: NO_CONNECTION };
    if (data.length === 0) break;
    const removed = await receipts.remove(data.map((file) => `${user.id}/${file.name}`));
    if (removed.error) return { error: NO_CONNECTION };
  }
  const avatar = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(user.id)]);
  if (avatar.error) return { error: NO_CONNECTION };

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    // Kept in the server log (Vercel → Logs), so the cause can be found.
    console.error("delete_my_account failed:", error.code, error.message);
    return { error: "Your photos were removed, but the account could not be deleted. Try again." };
  }

  // The login no longer exists; clear this device's session cookies.
  const cookieStore = await cookies();
  cookieStore
    .getAll()
    .filter((cookie) => isSupabaseAuthCookie(cookie.name) || cookie.name === IDLE_COOKIE)
    .forEach((cookie) => cookieStore.delete(cookie.name));
  redirect("/sign-in?reason=deleted");
}
