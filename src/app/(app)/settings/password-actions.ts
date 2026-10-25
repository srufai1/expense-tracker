"use server";

import { requireUser } from "@/lib/auth";
import { lockoutMessage } from "@/lib/lockout";
import { parseNewPassword, passwordUpdateError } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string; field?: "current" | "password" | "confirm"; done?: number };

// Settings → Change password (D-48). The current password is checked first
// (by signing in with it again), so someone holding an unlocked phone
// cannot change it.
export async function changePassword(_previous: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  if (!current) return { error: "Enter your current password.", field: "current" };
  const parsed = parseNewPassword({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  // 5 wrong current passwords lock Change password for 20 minutes (D-49).
  const lock = await supabase.rpc("auth_attempt_lock", { p_kind: "password", p_subject: null });
  if (lock.data) return { error: lockoutMessage(lock.data, new Date()), field: "current" };

  const check = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: current });
  if (check.error) {
    const refused = check.error.status && check.error.status < 500 && check.error.status !== 429;
    if (refused) {
      const failed = await supabase.rpc("auth_attempt_failed", { p_kind: "password", p_subject: null });
      if (failed.data) return { error: lockoutMessage(failed.data, new Date()), field: "current" };
    }
    return {
      error: refused ? "Your current password is not right." : passwordUpdateError(undefined, check.error.status),
      field: "current",
    };
  }
  await supabase.rpc("auth_attempt_cleared", { p_kind: "password" });
  const { error } = await supabase.auth.updateUser({ password: parsed.password });
  if (error) return { error: passwordUpdateError(error.code, error.status), field: "password" };
  return { done: Date.now() };
}
