"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewDetails } from "@/components/view-details";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import { pickRate, RATE_ATTRIBUTION, rateHint, sameRate, type StoredRate } from "@/lib/fx";
import { CURRENCIES, formatAmountForInput, formatMoney, type Currency } from "@/lib/money";
import {
  ENTRY_KINDS,
  exchangeFields,
  exchangePreview,
  keptAccountAmount,
  parseTransactionForm,
  TRANSACTION_FIELDS,
  type CategoryOption,
  type EntryKind,
  type TransactionFormErrors,
  type TypedAccountAmount,
} from "@/lib/transactions";

import { initialTransactionFormState, type TransactionFormState } from "./form-state";

// Where the cursor goes for each field when the error pop-up closes.
const FOCUS: Record<(typeof TRANSACTION_FIELDS)[number], string> = {
  kind: 'input[name="kind"]',
  amount: "#amount",
  currency: 'input[name="currency"]',
  categoryId: "#categoryId",
  accountId: "#accountId",
  occurredOn: "#occurredOn",
  rate: "#rate",
  accountAmount: "#accountAmount",
  note: "#note",
};
const KIND_LABEL: Record<EntryKind, string> = { expense: "Expense", income: "Income" };

export type TransactionFormValues = {
  kind: EntryKind;
  amount: string;
  currency: Currency;
  categoryId: string;
  accountId: string;
  occurredOn: string;
  rate: string;
  accountAmount: string;
  note: string;
};

export function TransactionForm({
  action,
  initial,
  keepTyped = false,
  categories,
  accounts,
  rates,
  submitLabel,
}: {
  action: (state: TransactionFormState, formData: FormData) => Promise<TransactionFormState>;
  initial: TransactionFormValues;
  // Editing: keep the stored rate and account amount (M-2) instead of
  // replacing them with suggestions, until the user changes something.
  keepTyped?: boolean;
  // The category picker for each kind (see categoryOptions).
  categories: Record<EntryKind, CategoryOption[]>;
  accounts: { id: string; name: string; currency: Currency }[];
  // Stored USD→GHS rates, to suggest the rate for the chosen date (M-5).
  rates: StoredRate[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialTransactionFormState);
  // A failed check in the browser. A new object each time, so the error
  // pop-up opens again on every failed attempt.
  const [clientAttempt, setClientAttempt] = useState<{ errors: TransactionFormErrors } | null>(null);

  // After a failed save, start from what the user typed. (The form keeps
  // its own state from then on, so this is only read on the first render.)
  const start = { ...initial, ...state.values } as TransactionFormValues;
  const [kind, setKind] = useState<EntryKind>(start.kind);
  const [currency, setCurrency] = useState<Currency>(start.currency);
  const [accountId, setAccountId] = useState(start.accountId);
  const [occurredOn, setOccurredOn] = useState(start.occurredOn);
  const [amount, setAmount] = useState(start.amount);
  // The rate and account amount follow the suggestions until typed in.
  // When editing, only real stored values are kept: a GHS transaction has
  // no rate, and its account amount matters only if the currencies differ.
  const [typedRate, setTypedRate] = useState<string | null>(keepTyped && start.rate !== "" ? start.rate : null);
  const [typedAccountAmount, setTypedAccountAmount] = useState<TypedAccountAmount | null>(() => {
    const startAccount = accounts.find((account) => account.id === start.accountId);
    return keepTyped && startAccount && startAccount.currency !== start.currency
      ? { text: start.accountAmount, currency: start.currency, accountCurrency: startAccount.currency }
      : null;
  });

  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? null;
  const { showRate, showAccountAmount } = exchangeFields(currency, accountCurrency);
  const picked = pickRate(rates, occurredOn);
  const rate = typedRate ?? picked?.rate ?? "";
  const preview = exchangePreview(amount, rate, currency, accountCurrency);
  const accountAmount =
    keptAccountAmount(typedAccountAmount, currency, accountCurrency) ??
    (preview.accountAmountMinor === null ? "" : formatAmountForInput(preview.accountAmountMinor));
  const ownRate = typedRate !== null && !(picked && sameRate(typedRate, picked.rate));

  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: TransactionFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, TRANSACTION_FIELDS);

  // Quick check in the browser. The Server Action checks again, with the
  // account's currency and the stored rate.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseTransactionForm(Object.fromEntries(new FormData(event.currentTarget)));
    const errors: TransactionFormErrors = result.ok ? {} : { ...result.errors };
    // The same rule as buildTransactionRow: USD always needs a rate; GHS on
    // a USD account needs one unless the account amount is typed.
    const rateNeeded = currency === "USD" || (showAccountAmount && accountAmount.trim() === "");
    if (showRate && rateNeeded && rate.trim() === "" && !errors.rate) {
      errors.rate = "Enter the exchange rate: how many GHS for 1 USD.";
    }
    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      setClientAttempt({ errors });
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

      <Segmented legend="Type" name="kind" options={ENTRY_KINDS} value={kind} onChange={setKind} label={(k) => KIND_LABEL[k]} />
      <ScreenReaderError id="kind-error" message={errors.kind} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
              {currency}
            </span>
            <Input
              id="amount"
              name="amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "amount-error" : undefined}
              className="h-14 pl-14 text-2xl font-bold tabular-nums"
            />
          </div>
          <div className="w-32 shrink-0">
            <Segmented
              legend="Currency"
              name="currency"
              options={CURRENCIES}
              value={currency}
              onChange={setCurrency}
              label={(c) => c}
              tall
            />
          </div>
        </div>
        {currency === "USD" && preview.amountGhsMinor !== null ? (
          <p className="text-xs text-muted-foreground">
            = {formatMoney(preview.amountGhsMinor, "GHS")} at {rate}
          </p>
        ) : null}
        <ScreenReaderError id="amount-error" message={errors.amount} />
        <ScreenReaderError id="currency-error" message={errors.currency} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">Category</Label>
        {/* key: a new list of choices when the type changes */}
        <NativeSelect
          key={kind}
          id="categoryId"
          name="categoryId"
          defaultValue={start.kind === kind ? start.categoryId : ""}
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
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          aria-invalid={Boolean(errors.accountId)}
          aria-describedby={errors.accountId ? "accountId-error" : undefined}
        >
          <option value="">Choose an account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
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
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          aria-invalid={Boolean(errors.occurredOn)}
          aria-describedby={errors.occurredOn ? "occurredOn-error" : undefined}
          className="h-12 text-base"
        />
        <ScreenReaderError id="occurredOn-error" message={errors.occurredOn} />
      </div>

      {showRate ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rate">Exchange rate (GHS for 1 USD)</Label>
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
          <p id="rate-hint" className="text-xs text-muted-foreground">
            {ownRate ? "Your own rate. " : `${rateHint(picked, occurredOn)} `}
            <a href={RATE_ATTRIBUTION.href} target="_blank" rel="noreferrer" className="underline">
              {RATE_ATTRIBUTION.label}
            </a>
          </p>
          <ScreenReaderError id="rate-error" message={errors.rate} />
        </div>
      ) : (
        <input type="hidden" name="rate" value="" />
      )}

      {showAccountAmount && accountCurrency ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="accountAmount">
            {kind === "income" ? "Amount into the account" : "Amount taken from the account"} ({accountCurrency})
          </Label>
          <Input
            id="accountAmount"
            name="accountAmount"
            value={accountAmount}
            onChange={(event) =>
              setTypedAccountAmount({ text: event.target.value, currency, accountCurrency: accountCurrency })
            }
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            aria-invalid={Boolean(errors.accountAmount)}
            aria-describedby={`accountAmount-hint${errors.accountAmount ? " accountAmount-error" : ""}`}
            className="h-12 text-base tabular-nums"
          />
          <ViewDetails id="accountAmount-hint">
            Worked out from the rate. If your bank or MoMo charged a different amount, type that instead.
          </ViewDetails>
          <ScreenReaderError id="accountAmount-error" message={errors.accountAmount} />
        </div>
      ) : (
        <input type="hidden" name="accountAmount" value="" />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input
          id="note"
          name="note"
          defaultValue={start.note}
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

// Two or more choices side by side, as radio buttons.
function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  label,
  tall = false,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => ReactNode;
  tall?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className={`grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 ${tall ? "h-14" : ""}`}>
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-bold text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {label(option)}
          </label>
        ))}
      </div>
    </fieldset>
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
