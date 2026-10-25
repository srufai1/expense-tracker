"use client";

import { useActionState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const invalid = (field: SignUpState["field"]) => state.field === field;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not create the account"
        messages={state.error ? [state.error] : []}
        focusSelector={state.field ? `#${state.field}` : null}
      />

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
          aria-invalid={invalid("email")}
          className="h-12 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={invalid("password")}
          aria-describedby="password-hint"
          className="h-12 text-base"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Password again</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          maxLength={72}
          aria-invalid={invalid("confirm")}
          className="h-12 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="inviteCode">Invite code</Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={256}
          aria-invalid={invalid("inviteCode")}
          className="h-12 text-base"
        />
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
