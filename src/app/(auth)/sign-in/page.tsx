import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { isSignUpOpen } from "@/lib/sign-up";

import { AuthShell } from "../auth-shell";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in"
      description="Use the email and password of your account."
      footer={
        // Invite-only sign-up (D-45): the link shows only when it is open.
        isSignUpOpen(process.env.SIGNUP_INVITE_CODE) ? (
          <>
            Have an invite code?{" "}
            <Link
              href="/sign-up"
              className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : null
      }
    >
      {/* The form reads ?next= from the URL, which is request data, so it
          renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
