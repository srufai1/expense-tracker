// Forgot password and change password (D-48). The same length rule as
// sign-up: at least 8 characters, at most 72 (the most Supabase uses).

const MIN = 8;
const MAX = 72;
const NO_CONNECTION = "Could not reach the server. Check your internet connection and try again.";

export type NewPasswordField = "password" | "confirm";

export function parseNewPassword(values: {
  password: string;
  confirm: string;
}): { ok: true; password: string } | { ok: false; field: NewPasswordField; error: string } {
  const { password, confirm } = values;
  if (password.length < MIN) return { ok: false, field: "password", error: `Use a password of at least ${MIN} characters.` };
  if (password.length > MAX) return { ok: false, field: "password", error: `Use a password of at most ${MAX} characters.` };
  if (password !== confirm) return { ok: false, field: "confirm", error: "The two passwords are not the same." };
  return { ok: true, password };
}

// Why Supabase did not save the new password.
export function passwordUpdateError(code: string | undefined, status: number | undefined): string {
  if (code === "same_password") return "The new password must be different from the old one.";
  if (code === "weak_password") return "Supabase refused this password as too weak. Choose a longer one.";
  if (code === "session_not_found" || code === "session_expired") {
    return "Your sign-in has expired. Ask for a new reset link and try again.";
  }
  if (!status || status >= 500) return NO_CONNECTION;
  return "Could not change the password. Try again.";
}

// What to say after "Send reset link". The same words whether or not the
// email has an account, so the page never reveals who has one.
export function resetLinkMessage(status: number | undefined): { ok: boolean; message: string } {
  if (status === 429) return { ok: false, message: "Too many reset emails were asked for. Wait an hour, then try again." };
  if (status === 0 || (status !== undefined && status >= 500)) return { ok: false, message: NO_CONNECTION };
  return {
    ok: true,
    message: "If an account uses this email, a reset link is on its way. Check your inbox and spam folder.",
  };
}
