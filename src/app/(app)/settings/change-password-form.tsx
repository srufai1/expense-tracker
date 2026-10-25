"use client";

import { CircleCheck } from "lucide-react";
import { useActionState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NewPasswordFields } from "@/components/new-password-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changePassword, type ChangePasswordState } from "./password-actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    // A new key after each success empties the fields.
    <form key={state.done ?? 0} action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not change the password"
        messages={state.error ? [state.error] : []}
        focusSelector={state.field ? `#${state.field}` : null}
      />
      {state.done ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-income">
          <CircleCheck className="size-4" aria-hidden="true" />
          Password changed.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="current">Current password</Label>
        <Input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          aria-invalid={state.field === "current"}
          className="h-12 text-base"
        />
      </div>
      <NewPasswordFields invalid={state.field === "current" ? undefined : state.field} />
      <Button type="submit" variant="outline" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
