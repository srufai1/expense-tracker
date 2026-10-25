"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { resetLinkMessage } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error?: string; sent?: string; email?: string };

// Asks Supabase to email a reset link (D-48). The link returns to
// /auth/callback, then opens "Choose a new password". Supabase only accepts
// return addresses listed in Authentication → URL Configuration.
export async function sendResetLink(_previous: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");
  const parsed = z.string().trim().toLowerCase().pipe(z.email().max(254)).safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address.", email };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  const result = resetLinkMessage(error ? (error.status ?? 0) : undefined);
  return result.ok ? { sent: result.message, email } : { error: result.message, email };
}
