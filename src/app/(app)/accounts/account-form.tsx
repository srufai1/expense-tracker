"use client";

import { useActionState, useState, type FormEvent } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewDetails } from "@/components/view-details";
import { ACCOUNT_TYPES, parseAccountForm, type AccountFormErrors } from "@/lib/accounts";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/utils";

import { AccountTypeIcon } from "./account-type-icon";
import { initialAccountFormState, type AccountFormState } from "./form-state";

// The fields in the order they appear on screen, and where the cursor goes
// for each one when the error pop-up closes.
const FIELD_ORDER = ["name", "type", "currency", "openingBalance", "openingBalanceOn"] as const;
const FOCUS: Record<(typeof FIELD_ORDER)[number], string> = {
  name: "#name",
  type: 'input[name="type"]',
  currency: 'input[name="currency"]',
  openingBalance: "#openingBalance",
  openingBalanceOn: "#openingBalanceOn",
};

type Values = {
  name: string;
  type: string;
  currency: string;
  openingBalance: string;
  openingBalanceOn: string;
};

export function AccountForm({
  action,
  initial,
  submitLabel,
  today,
  currencyLocked = false,
}: {
  action: (state: AccountFormState, formData: FormData) => Promise<AccountFormState>;
  initial: Values;
  submitLabel: string;
  // Today's date in Accra, from the server. Reading the clock while rendering
  // would break Cache Components pre-rendering.
  today: string;
  // An account with transactions keeps its currency (the database agrees).
  currencyLocked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialAccountFormState);
  // A failed check in the browser. A new object each time, so the error
  // pop-up opens again on every failed attempt.
  const [clientAttempt, setClientAttempt] = useState<{ errors: AccountFormErrors } | null>(null);

  // After a failed save, show what the user typed rather than the old values.
  const values = { ...initial, ...state.values } as Values;
  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: AccountFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, FIELD_ORDER);

  // Quick check in the browser. The Server Action checks again.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseAccountForm(Object.fromEntries(new FormData(event.currentTarget)), today);
    if (!result.ok) {
      event.preventDefault();
      setClientAttempt({ errors: result.errors });
    } else {
      setClientAttempt(null);
    }
  }

  return (
    <form action={formAction} onSubmit={checkBeforeSending} noValidate className="flex flex-col gap-5">
      <FormErrorDialog
        attempt={attempt}
        title={Object.keys(errors).length > 0 ? "Please check the form" : "Could not save"}
        messages={errorList(errors, FIELD_ORDER, formError)}
        focusSelector={firstWrong ? FOCUS[firstWrong] : null}
      />

      <Field id="name" label="Name" error={errors.name}>
        <Input
          id="name"
          name="name"
          defaultValue={values.name}
          placeholder="e.g. Ecobank Savings"
          maxLength={60}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      <fieldset className="flex flex-col gap-2" aria-describedby={errors.type ? "type-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div
          className={cn(
            "grid grid-cols-2 gap-2",
            errors.type && "rounded-xl ring-2 ring-destructive ring-offset-2 ring-offset-background",
          )}
        >
          {ACCOUNT_TYPES.map((option) => (
            <label
              key={option.value}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="type"
                value={option.value}
                defaultChecked={values.type === option.value}
                className="sr-only"
              />
              <AccountTypeIcon type={option.value} className="size-5" />
              {option.label}
            </label>
          ))}
        </div>
        <FieldError id="type-error" message={errors.type} />
      </fieldset>

      {currencyLocked ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Currency</span>
          <input type="hidden" name="currency" value={values.currency} />
          <p className="text-base font-bold">{values.currency}</p>
          <ViewDetails>This account has transactions, so its currency cannot change.</ViewDetails>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2" aria-describedby={errors.currency ? "currency-error" : undefined}>
          <legend className="mb-2 text-sm font-medium">Currency</legend>
          <div
            className={cn(
              "grid grid-cols-2 gap-1 rounded-xl bg-muted p-1",
              errors.currency && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
            )}
          >
            {CURRENCIES.map((currency) => (
              <label
                key={currency}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-bold text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="currency"
                  value={currency}
                  defaultChecked={values.currency === currency}
                  className="sr-only"
                />
                {currency}
              </label>
            ))}
          </div>
          <FieldError id="currency-error" message={errors.currency} />
        </fieldset>
      )}

      <Field
        id="openingBalance"
        label="Opening balance"
        details="Use a minus sign for an overdraft or money owed on a card, e.g. -250."
        error={errors.openingBalance}
      >
        <Input
          id="openingBalance"
          name="openingBalance"
          defaultValue={values.openingBalance}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          aria-invalid={Boolean(errors.openingBalance)}
          aria-describedby={`openingBalance-hint${errors.openingBalance ? " openingBalance-error" : ""}`}
          className="h-12 text-base tabular-nums"
        />
      </Field>

      <Field
        id="openingBalanceOn"
        label="Balance on"
        details="The day this balance was true. Transactions before it do not change the balance."
        error={errors.openingBalanceOn}
      >
        <Input
          id="openingBalanceOn"
          name="openingBalanceOn"
          type="date"
          defaultValue={values.openingBalanceOn}
          max={today}
          aria-invalid={Boolean(errors.openingBalanceOn)}
          aria-describedby={`openingBalanceOn-hint${errors.openingBalanceOn ? " openingBalanceOn-error" : ""}`}
          className="h-12 text-base"
        />
      </Field>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  details,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  // An explanation, shown under "View details" (D-53).
  details?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {details ? <ViewDetails id={`${id}-hint`}>{details}</ViewDetails> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// The message stays in the page for screen readers (linked to the field with
// aria-describedby); sighted users see it in the pop-up and the red outline.
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="sr-only">
      {message}
    </p>
  );
}
