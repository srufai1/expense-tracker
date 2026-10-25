"use server";

import { redirect } from "next/navigation";

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

  if (!inviteCodeMatches(parsed.data.inviteCode, process.env.SIGNUP_INVITE_CODE)) {
    return { error: "That invite code is not right.", email, field: "inviteCode" };
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
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  redirect(signInError ? "/sign-in" : "/");
}
