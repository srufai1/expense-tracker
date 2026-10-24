"use client";

import { useState, type FormEvent } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customPeriod } from "@/lib/reports/periods";

type Wrong = "from" | "to" | "both";

// Which field a custom-period message is about.
const wrongField = (error: string): Wrong => (error === "Enter real dates." ? "both" : "to");

// The two dates of a custom report (any range up to 366 days, §7.2). It is
// a plain GET form: the dates go into the address, so the report can be
// bookmarked. Checked here first; the page checks the address again.
export function CustomRangeForm({ from, to, serverError }: { from: string; to: string; serverError: string | null }) {
  const [attempt, setAttempt] = useState<{ error: string } | null>(() => (serverError ? { error: serverError } : null));
  const wrong = attempt ? wrongField(attempt.error) : null;

  function check(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const result = customPeriod(String(data.get("from")), String(data.get("to")));
    if (!result.ok) {
      event.preventDefault();
      setAttempt({ error: result.error });
    }
  }

  const invalid = (field: "from" | "to") => wrong === "both" || wrong === field;
  return (
    <form action="/reports" method="get" onSubmit={check} noValidate className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <FormErrorDialog
        attempt={attempt}
        title="Please check the dates"
        messages={attempt ? [attempt.error] : []}
        focusSelector={wrong === "to" ? "#to" : "#from"}
      />
      <input type="hidden" name="period" value="custom" />
      <div className="grid grid-cols-2 gap-3">
        {(["from", "to"] as const).map((field) => (
          <div key={field} className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={field}>{field === "from" ? "From" : "To"}</Label>
            <Input
              id={field}
              name={field}
              type="date"
              defaultValue={field === "from" ? from : to}
              aria-invalid={invalid(field)}
              aria-describedby={invalid(field) ? "range-error" : undefined}
              className="h-12 text-base"
            />
          </div>
        ))}
      </div>
      {/* Sighted users see the message in the pop-up (D-31). */}
      {attempt ? (
        <p id="range-error" className="sr-only">
          {attempt.error}
        </p>
      ) : null}
      <Button type="submit" className="h-11">
        Show report
      </Button>
    </form>
  );
}
