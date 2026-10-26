"use client";

import { useState, useTransition, type ReactNode } from "react";

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

// A button that runs a Server Action (undo, remove, mark paid). With
// `confirm`, it asks first. A failure shows in the D-31 pop-up.
export function ActionButton({
  action,
  children,
  label,
  confirm,
  variant = "outline",
  size = "default",
  className,
}: {
  action: () => Promise<string | undefined>;
  children: ReactNode;
  label?: string;
  confirm?: { title: string; description: string; yes: string };
  variant?: "outline" | "ghost" | "default" | "destructive";
  size?: "default" | "icon" | "sm";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string } | null>(null);
  const run = () =>
    startTransition(async () => {
      const message = await action();
      setFailure(message ? { message } : null);
    });

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={size === "icon" ? `size-11 shrink-0 ${className ?? ""}` : `h-11 ${className ?? ""}`}
      aria-label={label}
      disabled={pending}
      onClick={confirm ? undefined : run}
    >
      {children}
    </Button>
  );

  return (
    <>
      <FormErrorDialog attempt={failure} title="Could not do that" messages={failure ? [failure.message] : []} />
      {confirm ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={run}>
                {confirm.yes}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        button
      )}
    </>
  );
}
