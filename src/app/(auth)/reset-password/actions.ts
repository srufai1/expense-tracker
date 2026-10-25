"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { parseNewPassword, passwordUpdateError, type NewPasswordField } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

export type NewPasswordState = { error?: string; field?: NewPasswordField };

// Step 2 of a password reset (D-48): the email link signed the person in,
// so the new password is saved for that session's user.
export async function saveNewPassword(_previous: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  await requireUser();
  const parsed = parseNewPassword({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.password });
  if (error) return { error: passwordUpdateError(error.code, error.status), field: "password" };
  redirect("/");
}
