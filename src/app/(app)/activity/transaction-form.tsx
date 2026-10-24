"use client";

import { useActionState, useState, type FormEvent } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import {
  ENTRY_KINDS,
  parseTransactionForm,
  TRANSACTION_FIELDS,
  type CategoryOption,
  type EntryKind,
  type TransactionFormErrors,
} from "@/lib/transactions";

import { initialTransactionFormState, type TransactionFormState } from "./form-state";

// Where the cursor goes for each field when the error pop-up closes.
const FOCUS: Record<(typeof TRANSACTION_FIELDS)[number], string> = {
  kind: 'input[name="kind"]',
  amount: "#amount",
  categoryId: "#categoryId",
  accountId: "#accountId",
  occurredOn: "#occurredOn",
  note: "#note",
};
const KIND_LABEL: Record<EntryKind, string> = { expense: "Expense", income: "Income" };

type Values = {
  kind: EntryKind;
  amount: string;
  categoryId: string;
  accountId: string;
  occurredOn: string;
  note: string;
};

export function TransactionForm({
  action,
  initial,
  categories,
  accounts,
  submitLabel,
}: {
  action: (state: TransactionFormState, formData: FormData) => Promise<TransactionFormState>;
  initial: Values;
  // The category picker for each kind (see categoryOptions).
  categories: Record<EntryKind, CategoryOption[]>;
  accounts: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialTransactionFormState);
  // A failed check in the browser. A new object each time, so the error
  // pop-up opens again on every failed attempt.
  const [clientAttempt, setClientAttempt] = useState<{ errors: TransactionFormErrors } | null>(null);

  // After a failed save, show what the user typed rather than the old values.
  const values = { ...initial, ...state.values } as Values;
  const [kind, setKind] = useState<EntryKind>(values.kind);
  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: TransactionFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, TRANSACTION_FIELDS);

  // Quick check in the browser. The Server Action checks again.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseTransactionForm(Object.fromEntries(new FormData(event.currentTarget)));
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
        messages={errorList(errors, TRANSACTION_FIELDS, formError)}
        focusSelector={firstWrong ? FOCUS[firstWrong] : null}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Type</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {ENTRY_KINDS.map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-bold text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              {KIND_LABEL[option]}
            </label>
          ))}
        </div>
        <ScreenReaderError id="kind-error" message={errors.kind} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
            GHS
          </span>
          <Input
            id="amount"
            name="amount"
            defaultValue={values.amount}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "amount-error" : undefined}
            className="h-14 pl-14 text-2xl font-bold tabular-nums"
          />
        </div>
        <ScreenReaderError id="amount-error" message={errors.amount} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">Category</Label>
        {/* key: a new list of choices when the type changes */}
        <NativeSelect
          key={kind}
          id="categoryId"
          name="categoryId"
          defaultValue={values.kind === kind ? values.categoryId : ""}
          aria-invalid={Boolean(errors.categoryId)}
          aria-describedby={errors.categoryId ? "categoryId-error" : undefined}
        >
          <option value="">Choose a category</option>
          {categories[kind].map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </NativeSelect>
        <ScreenReaderError id="categoryId-error" message={errors.categoryId} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="accountId">{kind === "income" ? "Into account" : "From account"}</Label>
        <NativeSelect
          id="accountId"
          name="accountId"
          defaultValue={values.accountId}
          aria-invalid={Boolean(errors.accountId)}
          aria-describedby={errors.accountId ? "accountId-error" : undefined}
        >
          <option value="">Choose an account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
        <ScreenReaderError id="accountId-error" message={errors.accountId} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="occurredOn">Date</Label>
        <Input
          id="occurredOn"
          name="occurredOn"
          type="date"
          defaultValue={values.occurredOn}
          aria-invalid={Boolean(errors.occurredOn)}
          aria-describedby={errors.occurredOn ? "occurredOn-error" : undefined}
          className="h-12 text-base"
        />
        <ScreenReaderError id="occurredOn-error" message={errors.occurredOn} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input
          id="note"
          name="note"
          defaultValue={values.note}
          placeholder="e.g. Waakye at Auntie Muni"
          maxLength={200}
          autoComplete="off"
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? "note-error" : undefined}
          className="h-12 text-base"
        />
        <ScreenReaderError id="note-error" message={errors.note} />
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// Sighted users see the message in the pop-up; screen readers read it here.
function ScreenReaderError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="sr-only">
      {message}
    </p>
  );
}
