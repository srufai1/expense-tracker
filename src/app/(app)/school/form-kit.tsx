"use client";

import { Minus, Plus } from "lucide-react";
import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewDetails } from "@/components/view-details";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

// The building blocks of the School money forms (D-54 – D-56): the D-31
// error pop-up, fields with `aria-invalid`, and screen-reader messages.

export type SchoolFormState = {
  errors: Record<string, string | undefined>;
  formError?: string;
  values?: Record<string, string>;
  // A new object after each successful save, so the form empties itself.
  saved?: { at: number };
};

export type Errors = Record<string, string | undefined>;
type Check = (form: HTMLFormElement) => { ok: true } | { ok: false; errors: Errors };

// A form that checks itself before sending (the same parser the Server
// Action runs) and shows what is wrong in the pop-up.
export function SchoolForm({
  action,
  check,
  order,
  submitLabel,
  resetOnSave = false,
  children,
}: {
  action: (state: SchoolFormState, formData: FormData) => Promise<SchoolFormState>;
  check: Check;
  order: readonly string[];
  submitLabel: string;
  resetOnSave?: boolean;
  children: (form: { errors: Errors; values: Record<string, string> }) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} } as SchoolFormState);
  const [clientAttempt, setClientAttempt] = useState<{ errors: Errors } | null>(null);

  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, order);
  const values = state.saved && resetOnSave ? {} : (state.values ?? {});

  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = check(event.currentTarget);
    if (!result.ok) {
      event.preventDefault();
      setClientAttempt({ errors: result.errors });
    } else {
      setClientAttempt(null);
    }
  }

  return (
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
        focusSelector={firstWrong ? `[name="${firstWrong}"]` : null}
      />
      {children({ errors, values })}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// The form's text as an object, for the parsers.
export function formObject(form: HTMLFormElement): Record<string, unknown> {
  return Object.fromEntries(new FormData(form));
}

function describedBy(name: string, hasDetails: boolean, error: string | undefined): string | undefined {
  return [hasDetails && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ") || undefined;
}

function ScreenReaderError({ name, error }: { name: string; error?: string }) {
  return error ? (
    <p id={`${name}-error`} className="sr-only">
      {error}
    </p>
  ) : null;
}

export function TextField({
  name,
  label,
  errors,
  defaultValue = "",
  prefix,
  type = "text",
  inputMode,
  placeholder,
  maxLength,
  details,
  onChange,
}: {
  name: string;
  label: string;
  errors: Errors;
  defaultValue?: string;
  onChange?: (value: string) => void;
  prefix?: string;
  type?: "text" | "date";
  inputMode?: "decimal" | "numeric" | "text";
  placeholder?: string;
  maxLength?: number;
  details?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={Boolean(errors[name])}
          aria-describedby={describedBy(name, Boolean(details), errors[name])}
          className={cn("h-12 text-base", prefix && "pl-14 tabular-nums")}
        />
      </div>
      {details ? <ViewDetails id={`${name}-hint`}>{details}</ViewDetails> : null}
      <ScreenReaderError name={name} error={errors[name]} />
    </div>
  );
}

export function TextArea({
  name,
  label,
  errors,
  placeholder,
  details,
}: {
  name: string;
  label: string;
  errors: Errors;
  placeholder?: string;
  details?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        rows={8}
        placeholder={placeholder}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={describedBy(name, Boolean(details), errors[name])}
        className="min-h-40 rounded-xl border bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
      />
      {details ? <ViewDetails id={`${name}-hint`}>{details}</ViewDetails> : null}
      <ScreenReaderError name={name} error={errors[name]} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  errors,
  options,
  defaultValue = "",
  placeholder,
  onChange,
}: {
  name: string;
  label: string;
  errors: Errors;
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect
        id={name}
        name={name}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <ScreenReaderError name={name} error={errors[name]} />
    </div>
  );
}

// Round buttons to pick one (radio) or several (checkbox) choices.
export function Chips({
  name,
  legend,
  errors,
  options,
  multiple = false,
  defaultValue = [],
  onChange,
}: {
  name: string;
  legend: string;
  errors: Errors;
  options: { value: string; label: string }[];
  multiple?: boolean;
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(defaultValue);
  function toggle(value: string) {
    const next = multiple ? (picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]) : [value];
    setPicked(next);
    onChange?.(next);
  }
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={errors[name] ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = picked.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                errors[name] && !on && "border-destructive",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={on}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <ScreenReaderError name={name} error={errors[name]} />
    </fieldset>
  );
}

// A number of students with − and + buttons (44 px each).
export function Stepper({
  name,
  label,
  errors,
  value,
  onChange,
}: {
  name: string;
  label: string;
  errors: Errors;
  value: string;
  onChange: (value: string) => void;
}) {
  const number = /^\d+$/.test(value) ? Number(value) : 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={name} className="font-bold">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label={`One less, ${label}`}
          onClick={() => onChange(String(Math.max(0, number - 1)))}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          className="h-11 w-16 text-center text-lg font-bold tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label={`One more, ${label}`}
          onClick={() => onChange(String(Math.min(500, number + 1)))}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <ScreenReaderError name={name} error={errors[name]} />
    </div>
  );
}
