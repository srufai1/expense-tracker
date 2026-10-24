"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import { pickRate, RATE_ATTRIBUTION, rateHint, sameRate, type StoredRate } from "@/lib/fx";
import { parseAmount, type Currency } from "@/lib/money";
import { impliedRate, parseTransferForm, TRANSFER_FIELDS, type TransferFormErrors } from "@/lib/transfers";

import type { TransferFormState } from "./transfer-actions";

// Where the cursor goes for each field when the error pop-up closes.
const FOCUS: Record<(typeof TRANSFER_FIELDS)[number], string> = {
  fromAccountId: "#fromAccountId",
  toAccountId: "#toAccountId",
  amount: "#amount",
  received: "#received",
  fee: "#fee",
  occurredOn: "#occurredOn",
  rate: "#rate",
  note: "#note",
};

export type TransferFormValues = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  received: string;
  fee: string;
  occurredOn: string;
  rate: string;
  note: string;
};

const initialState: TransferFormState = { errors: {} };

// Moving money between two of the user's own accounts, with an optional fee
// (D-06, D-07). Between currencies, both amounts are typed as they really
// happened (D-33); the form only shows the rate they imply.
export function TransferForm({
  action,
  initial,
  keepRate = false,
  accounts,
  rates,
  submitLabel,
}: {
  action: (state: TransferFormState, formData: FormData) => Promise<TransferFormState>;
  initial: TransferFormValues;
  // Editing: keep the stored rate (M-2) until the user changes it.
  keepRate?: boolean;
  accounts: { id: string; name: string; currency: Currency }[];
  rates: StoredRate[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientAttempt, setClientAttempt] = useState<{ errors: TransferFormErrors } | null>(null);

  // After a failed save, start from what the user typed.
  const start = { ...initial, ...state.values } as TransferFormValues;
  const [fromAccountId, setFromAccountId] = useState(start.fromAccountId);
  const [toAccountId, setToAccountId] = useState(start.toAccountId);
  const [amount, setAmount] = useState(start.amount);
  const [received, setReceived] = useState(start.received);
  const [occurredOn, setOccurredOn] = useState(start.occurredOn);
  const [typedRate, setTypedRate] = useState<string | null>(keepRate && start.rate !== "" ? start.rate : null);

  const fromCurrency = accounts.find((account) => account.id === fromAccountId)?.currency ?? null;
  const toCurrency = accounts.find((account) => account.id === toAccountId)?.currency ?? null;
  const twoCurrencies = fromCurrency !== null && toCurrency !== null && fromCurrency !== toCurrency;
  const showRate = fromCurrency === "USD";
  const picked = pickRate(rates, occurredOn);
  const rate = typedRate ?? picked?.rate ?? "";
  const ownRate = typedRate !== null && !(picked && sameRate(typedRate, picked.rate));

  const sent = parseAmount(amount);
  const got = parseAmount(received);
  const implied =
    twoCurrencies && fromCurrency && toCurrency
      ? impliedRate(sent.ok ? sent.minor : null, fromCurrency, got.ok ? got.minor : null, toCurrency)
      : null;

  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: TransferFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, TRANSFER_FIELDS);

  // Quick check in the browser, with the same rules as buildTransferArgs.
  // The Server Action checks again with the accounts' real currencies.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseTransferForm(Object.fromEntries(new FormData(event.currentTarget)));
    const errors: TransferFormErrors = result.ok ? {} : { ...result.errors };
    if (twoCurrencies && received.trim() === "" && !errors.received) {
      errors.received = `Enter the amount that arrived, in ${toCurrency}.`;
    }
    if (showRate && rate.trim() === "" && !errors.rate) errors.rate = "Enter the exchange rate: how many GHS for 1 USD.";
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      setClientAttempt({ errors });
    } else {
      setClientAttempt(null);
    }
  }

  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));

  return (
    <form action={formAction} onSubmit={checkBeforeSending} noValidate className="flex flex-col gap-5">
      <FormErrorDialog
        attempt={attempt}
        title={Object.keys(errors).length > 0 ? "Please check the form" : "Could not save"}
        messages={errorList(errors, TRANSFER_FIELDS, formError)}
        focusSelector={firstWrong ? FOCUS[firstWrong] : null}
      />

      <Field id="fromAccountId" label="From account" error={errors.fromAccountId}>
        <NativeSelect
          id="fromAccountId"
          name="fromAccountId"
          value={fromAccountId}
          onChange={(event) => setFromAccountId(event.target.value)}
          aria-invalid={Boolean(errors.fromAccountId)}
          aria-describedby={errors.fromAccountId ? "fromAccountId-error" : undefined}
        >
          <option value="">Choose an account</option>
          {accountOptions}
        </NativeSelect>
      </Field>

      <Field id="toAccountId" label="To account" error={errors.toAccountId}>
        <NativeSelect
          id="toAccountId"
          name="toAccountId"
          value={toAccountId}
          onChange={(event) => setToAccountId(event.target.value)}
          aria-invalid={Boolean(errors.toAccountId)}
          aria-describedby={errors.toAccountId ? "toAccountId-error" : undefined}
        >
          <option value="">Choose an account</option>
          {accountOptions}
        </NativeSelect>
      </Field>

      <Field id="amount" label={twoCurrencies ? "Amount sent" : "Amount"} error={errors.amount}>
        <MoneyInput
          id="amount"
          currency={fromCurrency}
          value={amount}
          onChange={setAmount}
          invalid={Boolean(errors.amount)}
          large
        />
      </Field>

      {twoCurrencies ? (
        <Field
          id="received"
          label="Amount received"
          hint={implied ?? "Type what arrived, as it really happened."}
          error={errors.received}
        >
          <MoneyInput
            id="received"
            currency={toCurrency}
            value={received}
            onChange={setReceived}
            invalid={Boolean(errors.received)}
            hasHint
          />
        </Field>
      ) : (
        <input type="hidden" name="received" value="" />
      )}

      <Field
        id="fee"
        label="Fee (optional)"
        hint="What the sending account charged. It is saved as a Fees & Charges expense."
        error={errors.fee}
      >
        <MoneyInput id="fee" currency={fromCurrency} defaultValue={start.fee} invalid={Boolean(errors.fee)} hasHint />
      </Field>

      <Field id="occurredOn" label="Date" error={errors.occurredOn}>
        <Input
          id="occurredOn"
          name="occurredOn"
          type="date"
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          aria-invalid={Boolean(errors.occurredOn)}
          aria-describedby={errors.occurredOn ? "occurredOn-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      {showRate ? (
        <Field
          id="rate"
          label="Exchange rate (GHS for 1 USD)"
          hint={
            <>
              {ownRate ? "Your own rate. " : `${rateHint(picked, occurredOn)} `}
              Used for the GHS value in reports.{" "}
              <a href={RATE_ATTRIBUTION.href} target="_blank" rel="noreferrer" className="underline">
                {RATE_ATTRIBUTION.label}
              </a>
            </>
          }
          error={errors.rate}
        >
          <Input
            id="rate"
            name="rate"
            value={rate}
            onChange={(event) => setTypedRate(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 11.67"
            autoComplete="off"
            aria-invalid={Boolean(errors.rate)}
            aria-describedby={`rate-hint${errors.rate ? " rate-error" : ""}`}
            className="h-12 text-base tabular-nums"
          />
        </Field>
      ) : (
        <input type="hidden" name="rate" value="" />
      )}

      <Field id="note" label="Note (optional)" error={errors.note}>
        <Input
          id="note"
          name="note"
          defaultValue={start.note}
          placeholder="e.g. Savings for rent"
          maxLength={200}
          autoComplete="off"
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? "note-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// A label, the control, an optional hint, and the message for screen
// readers (sighted users see it in the pop-up, D-31).
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
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
      {error ? (
        <p id={`${id}-error`} className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// An amount box with the account's currency in front.
function MoneyInput({
  id,
  currency,
  value,
  defaultValue,
  onChange,
  invalid,
  hasHint = false,
  large = false,
}: {
  id: string;
  currency: Currency | null;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  invalid: boolean;
  hasHint?: boolean;
  large?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
        {currency ?? ""}
      </span>
      <Input
        id={id}
        name={id}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={[hasHint && `${id}-hint`, invalid && `${id}-error`].filter(Boolean).join(" ") || undefined}
        className={large ? "h-14 pl-14 text-2xl font-bold tabular-nums" : "h-12 pl-14 text-base tabular-nums"}
      />
    </div>
  );
}
