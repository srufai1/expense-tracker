"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  error?: string;
  email?: string;
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
    return { error: "Enter a valid email address and your password.", email: typedEmail };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.status === 429) {
      return { error: "Too many attempts. Wait a few minutes, then try again.", email: typedEmail };
    }
    // A 4xx answer means Supabase was reached and refused the details.
    // Anything else (no answer, or a server error) is a connection problem,
    // and saying "wrong password" then would be misleading.
    if (!error.status || error.status >= 500) {
      return {
        error: "Could not reach the server. Check your internet connection and try again.",
        email: typedEmail,
      };
    }
    // One message for every refusal, so the page never reveals whether
    // an email address has an account.
    return { error: "That email and password do not match.", email: typedEmail };
  }

  redirect(safeRedirectPath(parsed.data.next));
}
