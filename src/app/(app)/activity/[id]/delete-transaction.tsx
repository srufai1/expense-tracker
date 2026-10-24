"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";

// D-26: delete at once, then offer Undo for 10 seconds. What was deleted is
// kept in the browser until then, and Undo puts it back with the same id.
// Used for expenses and income, and for transfers with their fee. When the
// Undo offer ends without Undo, onGone runs (it removes the receipt photo,
// D-43), so Undo can still bring the photo back.
export function DeleteTransaction<Snapshot>({
  thing,
  backHref,
  onDelete,
  onRestore,
  onGone,
}: {
  thing: "transaction" | "transfer";
  backHref: string;
  onDelete: () => Promise<{ snapshot: Snapshot } | { error: string }>;
  onRestore: (snapshot: Snapshot) => Promise<string | undefined>;
  onGone: () => Promise<void>;
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
      showUndo(thing, () => onRestore(result.snapshot), () => router.refresh(), onGone);
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

function showUndo(
  thing: string,
  restore: () => Promise<string | undefined>,
  refresh: () => void,
  onGone: () => Promise<void>,
) {
  const name = thing.charAt(0).toUpperCase() + thing.slice(1);
  // Clicking Undo also closes the toast; this keeps onGone from running then.
  let undone = false;
  const gone = () => {
    if (!undone) void onGone();
  };
  toast(`${name} deleted`, {
    duration: 10_000,
    onAutoClose: gone,
    onDismiss: gone,
    action: {
      label: "Undo",
      onClick: async () => {
        undone = true;
        const error = await restore();
        if (error) toast.error(error);
        else toast.success(`${name} put back`);
        refresh();
      },
    },
  });
}
