import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { appConfig } from "@/config/app";
import { isSignUpOpen } from "@/lib/sign-up";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-primary">{appConfig.name}</span>
        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use the email and password of your account.
        </p>
      </div>

      {/* The form reads ?next= from the URL, which is request data, so it
          renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
        <SignInForm />
      </Suspense>

      {/* Invite-only sign-up (D-45): the link shows only when it is open. */}
      {isSignUpOpen(process.env.SIGNUP_INVITE_CODE) ? (
        <p className="text-center text-sm text-muted-foreground">
          Have an invite code?{" "}
          <Link href="/sign-up" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      ) : null}
    </main>
  );
}
