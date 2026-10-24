"use client";

import { useActionState, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_TYPES, parseAccountForm, type AccountFormErrors } from "@/lib/accounts";
import { CURRENCIES } from "@/lib/money";

import { AccountTypeIcon } from "./account-type-icon";
import { initialAccountFormState, type AccountFormState } from "./form-state";

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
}: {
  action: (state: AccountFormState, formData: FormData) => Promise<AccountFormState>;
  initial: Values;
  submitLabel: string;
  // Today's date in Accra, from the server. Reading the clock while rendering
  // would break Cache Components pre-rendering.
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialAccountFormState);
  const [clientErrors, setClientErrors] = useState<AccountFormErrors | null>(null);

  // After a failed save, show what the user typed rather than the old values.
  const values = { ...initial, ...state.values } as Values;
  const errors = clientErrors ?? state.errors;

  // Quick check in the browser. The Server Action checks again.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseAccountForm(Object.fromEntries(new FormData(event.currentTarget)), today);
    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.errors);
    } else {
      setClientErrors(null);
    }
  }

  return (
    <form action={formAction} onSubmit={checkBeforeSending} noValidate className="flex flex-col gap-5">
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
        <div className="grid grid-cols-2 gap-2">
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

      <fieldset className="flex flex-col gap-2" aria-describedby={errors.currency ? "currency-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Currency</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
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

      <Field
        id="openingBalance"
        label="Opening balance"
        hint="Use a minus sign for an overdraft or money owed on a card, e.g. -250."
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
        hint="The day this balance was true. Transactions before it do not change the balance."
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

      {state.formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.formError}
        </p>
      ) : null}

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
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
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
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
