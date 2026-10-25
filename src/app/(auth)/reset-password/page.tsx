import type { Metadata } from "next";

import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

// Step 2 of a password reset (D-48). Opened by the email link (through
// /auth/callback), which signs the person in; a signed-out visitor is sent
// to sign in by the proxy.
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="You will use it the next time you sign in.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
