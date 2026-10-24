"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorList, firstInvalidField } from "@/lib/form-errors";

export type SimpleField = {
  name: string;
  label: string;
  type?: "text" | "date" | "month";
  inputMode?: "decimal" | "text";
  placeholder?: string;
  hint?: ReactNode;
  // Text before the value, e.g. "GHS".
  prefix?: string;
  maxLength?: number;
};

type State = { errors: Record<string, string | undefined>; formError?: string; values?: Record<string, string>; saved?: { at: number } };

// A short form of plain text fields with the D-31 error pop-up: used for
// budgets, goals and goal contributions. `check` is the same parser the
// Server Action runs. With `resetOnSave`, a successful save empties it.
export function SimpleForm({
  action,
  fields,
  initial,
  check,
  submitLabel,
  resetOnSave = false,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  fields: SimpleField[];
  initial: Record<string, string>;
  check: (raw: Record<string, unknown>) => { ok: true } | { ok: false; errors: Record<string, string | undefined> };
  submitLabel: string;
  resetOnSave?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} } as State);
  const [clientAttempt, setClientAttempt] = useState<{ errors: Record<string, string | undefined> } | null>(null);
  const order = fields.map((field) => field.name);
  const values = state.saved && resetOnSave ? initial : { ...initial, ...state.values };

  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, order);

  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = check(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.ok) {
      event.preventDefault();
      setClientAttempt({ errors: result.errors });
    } else {
      setClientAttempt(null);
    }
  }

  return (
    // key: a fresh form (empty fields) after each successful save.
    <form
      key={resetOnSave && state.saved ? JSON.stringify(state.saved) : "form"}
      action={formAction}
      onSubmit={checkBeforeSending}
      noValidate
      className="flex flex-col gap-5"
    >
      <FormErrorDialog
        attempt={attempt}
        title={Object.keys(errors).length > 0 ? "Please check the form" : "Could not save"}
        messages={errorList(errors, order, formError)}
        focusSelector={firstWrong ? `#${firstWrong}` : null}
      />
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <div className="relative">
            {field.prefix ? (
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
                {field.prefix}
              </span>
            ) : null}
            <Input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={values[field.name] ?? ""}
              inputMode={field.inputMode}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              autoComplete="off"
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={
                [field.hint && `${field.name}-hint`, errors[field.name] && `${field.name}-error`].filter(Boolean).join(" ") ||
                undefined
              }
              className={`h-12 text-base ${field.prefix ? "pl-14 tabular-nums" : ""}`}
            />
          </div>
          {field.hint ? (
            <p id={`${field.name}-hint`} className="text-xs text-muted-foreground">
              {field.hint}
            </p>
          ) : null}
          {errors[field.name] ? (
            <p id={`${field.name}-error`} className="sr-only">
              {errors[field.name]}
            </p>
          ) : null}
        </div>
      ))}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
