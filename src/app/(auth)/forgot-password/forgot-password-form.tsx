"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { sendResetLink, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(sendResetLink, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not send the link"
        messages={state.error ? [state.error] : []}
        focusSelector="#email"
      />
      {state.sent ? (
        <p role="status" className="flex gap-2 rounded-xl bg-accent p-3 text-sm text-accent-foreground">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.sent}
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
          aria-invalid={Boolean(state.error)}
          className="h-12 text-base"
        />
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Sending…" : state.sent ? "Send again" : "Send reset link"}
      </Button>
    </form>
  );
}
