"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useTransition } from "react";

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

import { deleteAccount, setAccountArchived } from "../actions";

// Archive (hide, keep history) and delete (remove for good) for one account.
export function AccountDangerZone({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-2 flex flex-col gap-3 border-t pt-5" aria-label="Archive or delete">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 text-base"
        disabled={pending}
        onClick={() => startTransition(() => setAccountArchived(id, !archived))}
      >
        {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        {archived ? "Unarchive account" : "Archive account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {archived
          ? "Shows the account in lists and totals again."
          : "Hides the account from lists and totals. Its history stays."}
      </p>

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
            Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account for good. It cannot be undone. To hide it but keep its history, archive
              it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => startTransition(() => deleteAccount(id))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
