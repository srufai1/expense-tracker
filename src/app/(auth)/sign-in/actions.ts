"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signInErrorField, signInErrorMessage } from "@/lib/auth-errors";
import { IDLE_COOKIE, idleCookieOptions } from "@/lib/idle";
import { lockoutMessage } from "@/lib/lockout";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  error?: string;
  email?: string;
  // The field to outline in red and move to after the error pop-up (D-31).
  field?: "email" | "password";
};

// The same limits as the form. The form checks them first for a quick
// message; this check is the one that counts, because a form can be bypassed.
const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  next: z.string().max(2048).optional(),
});

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  const typedEmail = String(formData.get("email") ?? "");

  if (!parsed.success) {
    return { error: "Enter a valid email address and your password.", email: typedEmail, field: "email" };
  }

  const supabase = await createClient();
  const email = parsed.data.email;

  // 5 failures lock this email for 20 minutes (D-49). Checked before the
  // password, so a locked email cannot be tried at all.
  const lock = await supabase.rpc("auth_attempt_lock", { p_kind: "sign-in", p_subject: email });
  if (lock.data) return { error: lockoutMessage(lock.data, new Date()), email: typedEmail };

  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });

  if (error) {
    // Only a refusal of the details counts as a failed attempt; a lost
    // connection or Supabase's own limit (429) does not.
    if (signInErrorField(error.status) === "password") {
      const failed = await supabase.rpc("auth_attempt_failed", { p_kind: "sign-in", p_subject: email });
      if (failed.data) return { error: lockoutMessage(failed.data, new Date()), email: typedEmail };
    }
    return {
      error: signInErrorMessage(error.status),
      email: typedEmail,
      field: signInErrorField(error.status),
    };
  }

  await supabase.rpc("auth_attempt_cleared", { p_kind: "sign-in" });
  // Starts the 20-minute idle clock (D-49).
  (await cookies()).set(IDLE_COOKIE, String(Date.now()), idleCookieOptions);
  redirect(safeRedirectPath(parsed.data.next));
}
