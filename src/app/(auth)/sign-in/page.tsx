import type { Metadata } from "next";
import { Suspense } from "react";

import { appConfig } from "@/config/app";

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
    </main>
  );
}
