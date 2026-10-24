import { z } from "zod";

import { isIsoDate, todayInAccra } from "./dates";
import { isStillUsed } from "./db-errors";
import { CURRENCIES, parseAmount, type Currency } from "./money";

// DESIGN §6.1 and D-05. The database allows the same four values.
export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((type) => type.value) as [AccountType, ...AccountType[]];

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((option) => option.value === type)?.label ?? type;
}

export type AccountInput = {
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalanceMinor: number;
  openingBalanceOn: string;
};

// The names of the fields in the account form.
const FIELDS = ["name", "type", "currency", "openingBalance", "openingBalanceOn"] as const;
type Field = (typeof FIELDS)[number];
export type AccountFormErrors = Partial<Record<Field, string>>;

// One set of rules for the account form. The form runs it in the browser for
// quick messages; the Server Action runs it again, because a browser check
// can be bypassed. The database checks the same limits a third time.
function accountFormSchema(today: string) {
  return z.object({
    name: z.string().trim().min(1, "Enter a name.").max(60, "Use 60 characters or fewer."),
    type: z.enum(ACCOUNT_TYPE_VALUES, { error: "Choose an account type." }),
    currency: z.enum(CURRENCIES, { error: "Choose GHS or USD." }),
    // Zero and negative balances are allowed (D-29).
    openingBalance: z.string().transform((text, context) => {
      const result = parseAmount(text, { allowNegative: true, allowZero: true });
      if (!result.ok) {
        context.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.minor;
    }),
    openingBalanceOn: z
      .string()
      .refine(isIsoDate, "Enter a real date.")
      .refine((date) => !isIsoDate(date) || date <= today, "The date cannot be in the future."),
  });
}

export function parseAccountForm(
  raw: Record<string, unknown>,
  today: string = todayInAccra(),
): { ok: true; value: AccountInput } | { ok: false; errors: AccountFormErrors } {
  // Anything missing or not text (for example a file) counts as empty.
  const text = Object.fromEntries(
    FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""]),
  );

  const result = accountFormSchema(today).safeParse(text);
  if (!result.success) {
    const errors: AccountFormErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as Field;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { openingBalance, ...rest } = result.data;
  return { ok: true, value: { ...rest, openingBalanceMinor: openingBalance } };
}

// Total per currency. GHS and USD are never added together here; converting
// USD needs an exchange rate (build step 5).
export function totalsByCurrency(
  accounts: { currency: Currency; balanceMinor: number }[],
): Record<Currency, number> {
  const totals: Record<Currency, number> = { GHS: 0, USD: 0 };
  for (const account of accounts) totals[account.currency] += account.balanceMinor;
  return totals;
}

// The message when deleting an account fails. Transactions point at the
// account (ON DELETE RESTRICT), so it can only be archived.
export function accountDeleteError(code: string | undefined): string {
  return isStillUsed(code)
    ? "This account has transactions, so it cannot be deleted. Archive it instead: it is hidden, and its history stays."
    : "Check your internet connection and try again.";
}
