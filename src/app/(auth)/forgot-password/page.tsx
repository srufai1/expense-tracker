import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ExpiredLinkNote } from "./expired-link-note";

export const metadata: Metadata = { title: "Forgot password" };

// Step 1 of a password reset (D-48): ask for the email.
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot password?"
      description="Enter the email of your account. We will email you a link to choose a new password."
      footer={
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      {/* ?link=expired comes from the address (request data). */}
      <Suspense fallback={null}>
        <ExpiredLinkNote />
      </Suspense>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
