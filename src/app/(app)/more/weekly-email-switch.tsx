"use client";

import { useOptimistic, useState, useTransition } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";

// On / Off for the Monday email. It saves at once; a failed save shows the
// D-31 pop-up and the switch goes back.
export function WeeklyEmailSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => Promise<string | undefined> }) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function choose(next: boolean) {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next);
      const message = await onChange(next);
      setFailure(message ? { message } : null);
    });
  }

  return (
    <fieldset disabled={pending}>
      <FormErrorDialog attempt={failure} title="Could not save" messages={failure ? [failure.message] : []} />
      <legend className="sr-only">Monday email</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([true, false] as const).map((value) => (
          <label
            key={String(value)}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-bold text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name="weekly-email"
              checked={shown === value}
              onChange={() => choose(value)}
              className="sr-only"
            />
            {value ? "On" : "Off"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
