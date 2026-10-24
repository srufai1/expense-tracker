"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorList, firstInvalidField } from "@/lib/form-errors";
import { CURRENCIES, type Currency } from "@/lib/money";
import {
  describeSchedule,
  FREQUENCIES,
  parseRecurringForm,
  RECURRING_FIELDS,
  RULE_KINDS,
  WEEKDAY_OPTIONS,
  type Frequency,
  type RecurringFormErrors,
  type RuleKind,
} from "@/lib/recurring";
import type { CategoryOption } from "@/lib/transactions";

import type { RecurringFormState } from "./actions";

// Where the cursor goes for each field when the error pop-up closes.
const FOCUS: Record<(typeof RECURRING_FIELDS)[number], string> = {
  kind: 'input[name="kind"]',
  amount: "#amount",
  currency: 'input[name="currency"]',
  categoryId: "#categoryId",
  accountId: "#accountId",
  toAccountId: "#toAccountId",
  frequency: 'input[name="frequency"]',
  weekday: "#weekday",
  dayOfMonth: "#dayOfMonth",
  startsOn: "#startsOn",
  endsOn: "#endsOn",
  note: "#note",
};
const KIND_LABEL: Record<RuleKind, string> = { expense: "Expense", income: "Income", transfer: "Transfer" };
const FREQUENCY_LABEL: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly" };

export type RecurringFormValues = {
  kind: RuleKind;
  amount: string;
  currency: Currency;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  frequency: Frequency;
  weekday: string;
  dayOfMonth: string;
  startsOn: string;
  endsOn: string;
  note: string;
};

const initialState: RecurringFormState = { errors: {} };

// A recurring item (screen 7): what to create, and when (DESIGN §6.6).
export function RecurringForm({
  action,
  initial,
  categories,
  accounts,
  submitLabel,
}: {
  action: (state: RecurringFormState, formData: FormData) => Promise<RecurringFormState>;
  initial: RecurringFormValues;
  categories: Record<"expense" | "income", CategoryOption[]>;
  accounts: { id: string; name: string; currency: Currency }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientAttempt, setClientAttempt] = useState<{ errors: RecurringFormErrors } | null>(null);

  const start = { ...initial, ...state.values } as RecurringFormValues;
  const [kind, setKind] = useState<RuleKind>(start.kind);
  const [currency, setCurrency] = useState<Currency>(start.currency);
  const [accountId, setAccountId] = useState(start.accountId);
  const [frequency, setFrequency] = useState<Frequency>(start.frequency);
  const [weekday, setWeekday] = useState(start.weekday || "1");
  const [dayOfMonth, setDayOfMonth] = useState(start.dayOfMonth || "1");

  const transfer = kind === "transfer";
  // A transfer is in the sending account's currency (D-38).
  const fromCurrency = accounts.find((account) => account.id === accountId)?.currency ?? null;
  const shownCurrency = transfer ? (fromCurrency ?? "GHS") : currency;

  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: RecurringFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, RECURRING_FIELDS);

  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseRecurringForm(Object.fromEntries(new FormData(event.currentTarget)));
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
        messages={errorList(errors, RECURRING_FIELDS, formError)}
        focusSelector={firstWrong ? FOCUS[firstWrong] : null}
      />

      <Segmented legend="Type" name="kind" options={RULE_KINDS} value={kind} onChange={setKind} label={(k) => KIND_LABEL[k]} />

      <Field id="amount" label="Amount" error={errors.amount}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold text-muted-foreground">
              {shownCurrency}
            </span>
            <Input
              id="amount"
              name="amount"
              defaultValue={start.amount}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "amount-error" : undefined}
              className="h-14 pl-14 text-2xl font-bold tabular-nums"
            />
          </div>
          {transfer ? (
            <input type="hidden" name="currency" value={shownCurrency} />
          ) : (
            <div className="w-32 shrink-0">
              <Segmented legend="Currency" name="currency" options={CURRENCIES} value={currency} onChange={setCurrency} label={(c) => c} tall />
            </div>
          )}
        </div>
      </Field>

      {transfer ? null : (
        <Field id="categoryId" label="Category" error={errors.categoryId}>
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
        </Field>
      )}

      <Field
        id="accountId"
        label={transfer ? "From account" : kind === "income" ? "Into account" : "From account"}
        error={errors.accountId}
      >
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
      </Field>

      {transfer ? (
        <Field
          id="toAccountId"
          label="To account"
          hint="A recurring transfer stays in one currency, with no fee."
          error={errors.toAccountId}
        >
          <NativeSelect
            id="toAccountId"
            name="toAccountId"
            defaultValue={start.toAccountId}
            aria-invalid={Boolean(errors.toAccountId)}
            aria-describedby={`toAccountId-hint${errors.toAccountId ? " toAccountId-error" : ""}`}
          >
            <option value="">Choose an account</option>
            {accounts
              .filter((account) => account.id !== accountId && (fromCurrency === null || account.currency === fromCurrency))
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
          </NativeSelect>
        </Field>
      ) : null}

      <Segmented
        legend="How often"
        name="frequency"
        options={FREQUENCIES}
        value={frequency}
        onChange={setFrequency}
        label={(f) => FREQUENCY_LABEL[f]}
      />

      {frequency === "weekly" ? (
        <Field id="weekday" label="On" error={errors.weekday}>
          <NativeSelect id="weekday" name="weekday" value={weekday} onChange={(event) => setWeekday(event.target.value)}>
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field id="dayOfMonth" label="On day" hint="29, 30 or 31: the last day in shorter months." error={errors.dayOfMonth}>
          <NativeSelect
            id="dayOfMonth"
            name="dayOfMonth"
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
            aria-describedby="dayOfMonth-hint"
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <p className="-mt-3 text-sm font-semibold">
        {describeSchedule({
          frequency,
          weekday: frequency === "weekly" ? Number(weekday) : null,
          dayOfMonth: frequency === "monthly" ? Number(dayOfMonth) : null,
        })}
      </p>

      <Field id="startsOn" label="Starts on" error={errors.startsOn}>
        <Input
          id="startsOn"
          name="startsOn"
          type="date"
          defaultValue={start.startsOn}
          aria-invalid={Boolean(errors.startsOn)}
          aria-describedby={errors.startsOn ? "startsOn-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      <Field id="endsOn" label="Ends on (optional)" error={errors.endsOn}>
        <Input
          id="endsOn"
          name="endsOn"
          type="date"
          defaultValue={start.endsOn}
          aria-invalid={Boolean(errors.endsOn)}
          aria-describedby={errors.endsOn ? "endsOn-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      <Field id="note" label="Note (optional)" error={errors.note}>
        <Input
          id="note"
          name="note"
          defaultValue={start.note}
          placeholder="e.g. Rent"
          maxLength={200}
          autoComplete="off"
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? "note-error" : undefined}
          className="h-12 text-base"
        />
      </Field>

      <p className="text-xs text-muted-foreground">
        The daily job adds each item on its date. An item due today appears after the next run.
      </p>

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
      {/* Sighted users see the message in the pop-up (D-31). */}
      {error ? (
        <p id={`${id}-error`} className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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
      <div
        className={`grid gap-1 rounded-xl bg-muted p-1 ${tall ? "h-14" : ""}`}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
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
