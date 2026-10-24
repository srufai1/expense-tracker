"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";

// D-26: delete at once, then offer Undo for 10 seconds. What was deleted is
// kept in the browser until then, and Undo puts it back with the same id.
// Used for expenses and income, and for transfers with their fee.
export function DeleteTransaction<Snapshot>({
  thing,
  backHref,
  onDelete,
  onRestore,
}: {
  thing: "transaction" | "transfer";
  backHref: string;
  onDelete: () => Promise<{ snapshot: Snapshot } | { error: string }>;
  onRestore: (snapshot: Snapshot) => Promise<string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A new object for every failure, so the error pop-up opens each time.
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function remove() {
    startTransition(async () => {
      const result = await onDelete();
      if ("error" in result) {
        setFailure({ message: result.error });
        return;
      }
      router.push(backHref);
      showUndo(thing, () => onRestore(result.snapshot), () => router.refresh());
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
        {pending ? "Deleting…" : `Delete ${thing}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        {thing === "transfer" ? "Its fee is deleted with it. " : ""}You can undo this for 10 seconds.
      </p>
    </section>
  );
}

function showUndo(thing: string, restore: () => Promise<string | undefined>, refresh: () => void) {
  const name = thing.charAt(0).toUpperCase() + thing.slice(1);
  toast(`${name} deleted`, {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: async () => {
        const error = await restore();
        if (error) toast.error(error);
        else toast.success(`${name} put back`);
        refresh();
      },
    },
  });
}
