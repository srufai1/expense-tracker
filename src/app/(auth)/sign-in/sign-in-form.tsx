"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signIn, type SignInState } from "./actions";

const initialState: SignInState = {};

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const reason = searchParams.get("reason");
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not sign in"
        messages={state.error ? [state.error] : []}
        focusSelector={state.field ? `#${state.field}` : null}
      />
      <input type="hidden" name="next" value={next} />
      {reason === "idle" ? (
        <p role="status" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
          You were signed out after 20 minutes without activity, to keep your money private. Sign in again to go on.
        </p>
      ) : reason === "deleted" ? (
        <p role="status" className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
          Your account and all its data were deleted.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          defaultValue={state.email}
          aria-invalid={state.field === "email"}
          className="h-12 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          {/* D-48: a password reset by email. */}
          <Link
            href="/forgot-password"
            className="-my-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          aria-invalid={state.field === "password"}
          required
          maxLength={128}
          className="h-12 text-base"
        />
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
