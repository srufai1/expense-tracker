"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { IDLE_COOKIE, idleCookieOptions } from "@/lib/idle";
import { lockoutMessage } from "@/lib/lockout";
import { clientAddress } from "@/lib/request";
import { inviteCodeMatches, parseSignUpForm, signUpErrorMessage, type SignUpField } from "@/lib/sign-up";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignUpState = {
  error?: string;
  email?: string;
  // The field to outline in red and move to after the error pop-up (D-31).
  field?: SignUpField;
};

// Invite-only sign-up (D-45). Public sign-ups stay OFF in Supabase, so the
// account is created here with the secret key, and only after the invite
// code matches: nobody can skip this page by calling Supabase directly.
export async function signUp(_previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const email = text("email");
  const parsed = parseSignUpForm({
    email,
    password: text("password"),
    confirm: text("confirm"),
    inviteCode: text("inviteCode"),
  });
  if (!parsed.ok) return { error: parsed.error, email, field: parsed.field };

  // 5 wrong codes from one network address lock it for 20 minutes (D-49).
  const supabase = await createClient();
  const address = clientAddress(await headers());
  const lock = await supabase.rpc("auth_attempt_lock", { p_kind: "invite", p_subject: address });
  if (lock.data) return { error: lockoutMessage(lock.data, new Date()), email, field: "inviteCode" };

  if (!inviteCodeMatches(parsed.data.inviteCode, process.env.SIGNUP_INVITE_CODE)) {
    const failed = await supabase.rpc("auth_attempt_failed", { p_kind: "invite", p_subject: address });
    const error = failed.data ? lockoutMessage(failed.data, new Date()) : "That invite code is not right.";
    return { error, email, field: "inviteCode" };
  }

  // The secret key is used only after the invite code matched.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    // The invite code already proves the person was invited.
    email_confirm: true,
  });
  if (error) return { error: signUpErrorMessage(error.code, error.status), email, field: "email" };

  // Sign the new user in with their own session, then go to Home (first-run setup).
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInError) redirect("/sign-in");
  // Starts the 20-minute idle clock (D-49).
  (await cookies()).set(IDLE_COOKIE, String(Date.now()), idleCookieOptions);
  redirect("/");
}
