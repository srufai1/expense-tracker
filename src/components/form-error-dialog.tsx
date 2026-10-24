"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// The pop-up that shows why a form could not be saved (D-31).
//
// `attempt` is the result of one failed save (a new object every time).
// The pop-up opens for each new attempt and stays closed once dismissed,
// so a re-render does not reopen it. On closing it moves the cursor to
// `focusSelector`, the first wrong field, so the user can fix it at once.
export function FormErrorDialog({
  attempt,
  title,
  messages,
  focusSelector,
}: {
  attempt: object | null;
  title: string;
  messages: string[];
  focusSelector?: string | null;
}) {
  const [dismissed, setDismissed] = useState<object | null>(null);
  const open = attempt !== null && attempt !== dismissed && messages.length > 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(attempt);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const field = focusSelector ? document.querySelector<HTMLElement>(focusSelector) : null;
          if (field) {
            event.preventDefault();
            // Centre the field so its label stays visible above it.
            field.focus({ preventScroll: true });
            field.scrollIntoView({ block: "center" });
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {messages.length === 1 ? (
              <p>{messages[0]}</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-left">
                {messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="h-11">OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
