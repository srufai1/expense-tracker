"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signInErrorField, signInErrorMessage } from "@/lib/auth-errors";
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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: signInErrorMessage(error.status),
      email: typedEmail,
      field: signInErrorField(error.status),
    };
  }

  redirect(safeRedirectPath(parsed.data.next));
}
