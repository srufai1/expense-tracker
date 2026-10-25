import type { Metadata } from "next";
import Link from "next/link";

import { isSignUpOpen } from "@/lib/sign-up";

import { AuthShell } from "../auth-shell";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
};

// Invite-only sign-up (D-45). Without SIGNUP_INVITE_CODE it is closed.
export default function SignUpPage() {
  const open = isSignUpOpen(process.env.SIGNUP_INVITE_CODE);

  return (
    <AuthShell
      title="Create an account"
      description={
        open ? "You need the invite code you were given." : "Sign-up is closed. Ask the owner of this app for an invite."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {open ? <SignUpForm /> : null}
    </AuthShell>
  );
}
