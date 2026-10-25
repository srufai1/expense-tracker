import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Invite-only sign-up (D-45). Public sign-ups stay off in Supabase; the
// sign-up action creates the account on the server, and only for someone
// who types the invite code (SIGNUP_INVITE_CODE).

// A shorter code could be guessed by trying many times.
const MIN_INVITE_CODE_LENGTH = 16;

export function isSignUpOpen(code: string | undefined): boolean {
  return Boolean(code && code.length >= MIN_INVITE_CODE_LENGTH);
}

// Compares hashes in constant time, like the daily job's secret (cron.ts),
// so the time taken does not reveal how much of a guess was right.
export function inviteCodeMatches(typed: string, code: string | undefined): boolean {
  if (!code || !isSignUpOpen(code)) return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(typed.trim()), digest(code));
}

export type SignUpField = "email" | "password" | "confirm" | "inviteCode";
export type SignUpInput = { email: string; password: string; inviteCode: string };

// Checked in this order, so the first mistake is the one reported.
// Passwords: at least 8 characters; at most 72, the most Supabase uses.
const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8).max(72),
  confirm: z.string(),
  inviteCode: z.string().trim().min(1).max(256),
});

const MESSAGES: Record<SignUpField, string> = {
  email: "Enter a valid email address.",
  password: "Use a password of at least 8 characters.",
  confirm: "The two passwords are not the same.",
  inviteCode: "Enter the invite code you were given.",
};

export function parseSignUpForm(values: Record<SignUpField, string>):
  | { ok: true; data: SignUpInput }
  | { ok: false; field: SignUpField; error: string } {
  const parsed = schema.safeParse(values);
  const order: SignUpField[] = ["email", "password", "confirm", "inviteCode"];
  const badFields = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0]));
  if (parsed.success && parsed.data.password !== parsed.data.confirm) badFields.add("confirm");
  const field = order.find((name) => badFields.has(name));
  if (field) {
    const error =
      field === "password" && values.password.length > 72 ? "Use a password of at most 72 characters." : MESSAGES[field];
    return { ok: false, field, error };
  }
  const { email, password, inviteCode } = parsed.data!;
  return { ok: true, data: { email, password, inviteCode } };
}

// Why Supabase could not create the account. Only someone with the invite
// code sees these, so saying that an email already has an account is fine.
export function signUpErrorMessage(code: string | undefined, status: number | undefined): string {
  if (code === "email_exists" || code === "user_already_exists") {
    return "An account with this email already exists. Sign in instead.";
  }
  if (code === "weak_password") return "Supabase refused this password as too weak. Choose a longer one.";
  if (!status || status >= 500) return "Could not reach the server. Check your internet connection and try again.";
  return "Could not create the account. Check the details and try again.";
}
