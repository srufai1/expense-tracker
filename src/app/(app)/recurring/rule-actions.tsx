"use client";

import { Pause, Play, SkipForward, Trash2 } from "lucide-react";
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

// Pause or resume, skip the next date, delete (screen 7). The actions return
// an error message, or redirect on success (D-31 pop-up on failure).
export function RuleActions({
  paused,
  nextLabel,
  onPause,
  onSkip,
  onDelete,
}: {
  paused: boolean;
  nextLabel: string;
  onPause: (paused: boolean) => Promise<string | undefined>;
  onSkip: () => Promise<string | undefined>;
  onDelete: () => Promise<string | undefined>;
}) {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function run(action: () => Promise<string | undefined>) {
    startTransition(async () => {
      const message = await action();
      setFailure(message ? { message } : null);
    });
  }

  return (
    <section className="mt-2 flex flex-col gap-3 border-t pt-5" aria-label="Pause, skip or delete">
      <FormErrorDialog attempt={failure} title="Could not change this item" messages={failure ? [failure.message] : []} />

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 text-base"
        disabled={pending}
        onClick={() => run(() => onPause(!paused))}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {paused
          ? "Resuming continues from the next date from today. Dates missed while paused are not added."
          : "Nothing is added while it is paused."}
      </p>

      {paused ? null : (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 text-base"
            disabled={pending}
            onClick={() => run(onSkip)}
          >
            <SkipForward aria-hidden="true" />
            Skip the next one
          </Button>
          <p className="text-xs text-muted-foreground">Next: {nextLabel}. Skipping moves it to the date after.</p>
        </>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="lg" className="h-12 text-base text-destructive" disabled={pending}>
            <Trash2 aria-hidden="true" />
            Delete recurring item
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recurring item?</AlertDialogTitle>
            <AlertDialogDescription>
              No more items will be added. The transactions it already added stay in your history.
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
    </section>
  );
}
