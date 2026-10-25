"use client";

import { Download, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_WORD, deleteConfirmed } from "@/lib/account-deletion";

import { deleteMyAccount, type DeleteAccountState } from "./delete-account-actions";

const initialState: DeleteAccountState = {};

// Settings → Delete my account (D-51). The button works only once DELETE is
// typed; the server checks the word again.
export function DeleteAccountCard() {
  const [state, formAction, pending] = useActionState(deleteMyAccount, initialState);
  const [typed, setTyped] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormErrorDialog
        attempt={state.error ? state : null}
        title="Could not delete the account"
        messages={state.error ? [state.error] : []}
        focusSelector="#confirm-delete"
      />
      <p className="text-sm text-muted-foreground">
        This removes <strong className="text-foreground">everything</strong>: your money accounts, transactions,
        categories, budgets, goals, recurring items, receipt photos, profile photo and your login.{" "}
        <strong className="text-foreground">It cannot be undone.</strong>
      </p>
      <a
        href="/api/export.xlsx?scope=all"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <Download className="size-4" aria-hidden="true" />
        Export everything (Excel) first
      </a>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-delete">Type {DELETE_WORD} to confirm</Label>
        <Input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={Boolean(state.error)}
          className="h-12 text-base"
        />
      </div>
      <Button
        type="submit"
        variant="destructive"
        size="lg"
        className="h-12 text-base"
        disabled={pending || !deleteConfirmed(typed)}
      >
        <Trash2 aria-hidden="true" />
        {pending ? "Deleting…" : "Delete my account forever"}
      </Button>
    </form>
  );
}
