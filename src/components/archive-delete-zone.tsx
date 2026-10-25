"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Archive (hide, keep history) and delete (remove for good), shared by the
// edit pages. The actions return an error message when they cannot finish,
// which opens the error pop-up (D-31); on success they redirect.
export function ArchiveDeleteZone({
  thing,
  name,
  archived,
  onArchive,
  onDelete,
  archiveHint,
  unarchiveHint,
  deleteDescription,
}: {
  thing: string;
  name: string;
  archived: boolean;
  onArchive?: (archived: boolean) => Promise<string | undefined>;
  onDelete?: () => Promise<string | undefined>;
  archiveHint: string;
  unarchiveHint: string;
  // What the confirm box says, when deleting does more than remove the thing.
  deleteDescription?: string;
}) {
  const [pending, startTransition] = useTransition();
  // A new object for every failure, so the pop-up opens each time.
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function run(action: () => Promise<string | undefined>) {
    startTransition(async () => {
      const message = await action();
      setFailure(message ? { message } : null);
    });
  }

  return (
    <section className="mt-2 flex flex-col gap-3 border-t pt-5" aria-label="Archive or delete">
      <FormErrorDialog
        attempt={failure}
        title={`Could not change this ${thing}`}
        messages={failure ? [failure.message] : []}
      />

      {onArchive ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 text-base"
            disabled={pending}
            onClick={() => run(() => onArchive(!archived))}
          >
            {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {archived ? `Unarchive ${thing}` : `Archive ${thing}`}
          </Button>
          <p className="text-xs text-muted-foreground">{archived ? unarchiveHint : archiveHint}</p>
        </>
      ) : null}

      {onDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 text-base text-destructive"
              disabled={pending}
            >
              <Trash2 aria-hidden="true" />
              Delete {thing}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteDescription ??
                  `This removes the ${thing} for good. It cannot be undone. To hide it but keep its history, archive it instead.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
              <AlertDialogAction variant="destructive" className="h-11" onClick={() => run(onDelete)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}
