"use client";

import { useActionState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NewPasswordFields } from "@/components/new-password-fields";
import { Button } from "@/components/ui/button";

import { saveNewPassword, type NewPasswordState } from "./actions";

const initialState: NewPasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(saveNewPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not save the password"
        messages={state.error ? [state.error] : []}
        focusSelector={state.field ? `#${state.field}` : null}
      />
      <NewPasswordFields invalid={state.field} />
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
