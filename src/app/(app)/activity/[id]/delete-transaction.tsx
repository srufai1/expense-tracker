"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import type { TransactionSnapshot } from "@/lib/transactions";

import { deleteTransaction, restoreTransaction } from "../actions";

// D-26: delete at once, then offer Undo for 10 seconds. The deleted row is
// kept in the browser until then, and Undo puts it back with the same id.
export function DeleteTransaction({ id, backHref }: { id: string; backHref: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A new object for every failure, so the error pop-up opens each time.
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function remove() {
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if ("error" in result) {
        setFailure({ message: result.error });
        return;
      }
      router.push(backHref);
      showUndo(result.snapshot, () => router.refresh());
    });
  }

  return (
    <section className="mt-2 flex flex-col gap-3 border-t pt-5" aria-label="Delete">
      <FormErrorDialog
        attempt={failure}
        title="Could not delete"
        messages={failure ? [failure.message] : []}
      />
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 text-base text-destructive"
        disabled={pending}
        onClick={remove}
      >
        <Trash2 aria-hidden="true" />
        {pending ? "Deleting…" : "Delete transaction"}
      </Button>
      <p className="text-xs text-muted-foreground">You can undo this for 10 seconds.</p>
    </section>
  );
}

function showUndo(snapshot: TransactionSnapshot, refresh: () => void) {
  toast("Transaction deleted", {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: async () => {
        const error = await restoreTransaction(snapshot);
        if (error) toast.error(error);
        else toast.success("Transaction put back");
        refresh();
      },
    },
  });
}
