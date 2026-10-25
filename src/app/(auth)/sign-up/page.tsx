import type { Metadata } from "next";
import Link from "next/link";

import { appConfig } from "@/config/app";
import { isSignUpOpen } from "@/lib/sign-up";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
};

// Invite-only sign-up (D-45). Without SIGNUP_INVITE_CODE it is closed.
export default function SignUpPage() {
  const open = isSignUpOpen(process.env.SIGNUP_INVITE_CODE);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-primary">{appConfig.name}</span>
        <h1 className="text-2xl font-extrabold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          {open
            ? "You need the invite code you were given."
            : "Sign-up is closed. Ask the owner of this app for an invite."}
        </p>
      </div>

      {open ? <SignUpForm /> : null}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
