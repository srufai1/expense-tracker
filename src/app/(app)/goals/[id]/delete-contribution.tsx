"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";

// Removes one contribution (a typing mistake, for example).
export function DeleteContribution({ label, onDelete }: { label: string; onDelete: () => Promise<string | undefined> }) {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string } | null>(null);
  return (
    <>
      <FormErrorDialog attempt={failure} title="Could not remove it" messages={failure ? [failure.message] : []} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={`Remove ${label}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const message = await onDelete();
            setFailure(message ? { message } : null);
          })
        }
      >
        <X aria-hidden="true" />
      </Button>
    </>
  );
}
