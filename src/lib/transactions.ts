import { z } from "zod";

import { categoryPath, type CategoryRow } from "./categories";
import { isIsoDate } from "./dates";
import { sameRate, type StoredRate } from "./fx";
import {
  convertFromGhs,
  convertToGhs,
  CURRENCIES,
  isValidRate,
  MAX_AMOUNT_MINOR,
  parseAmount,
  type Currency,
} from "./money";

// DESIGN §6.3. Transfers are added in build step 6.
export const ENTRY_KINDS = ["expense", "income"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type TransactionInput = {
  kind: EntryKind;
  amountMinor: number;
  currency: Currency;
  categoryId: string;
  accountId: string;
  occurredOn: string;
  // GHS for 1 USD, as typed ("" when not needed).
  rate: string;
  // What left (or entered) the account, in the account's currency, when it
  // differs from the transaction's currency (M-7). null: not typed.
  accountAmountMinor: number | null;
  note: string;
};

// The names of the fields in the transaction form, in screen order.
export const TRANSACTION_FIELDS = [
  "kind",
  "amount",
  "currency",
  "categoryId",
  "accountId",
  "occurredOn",
  "rate",
  "accountAmount",
  "note",
] as const;
type Field = (typeof TRANSACTION_FIELDS)[number];
export type TransactionFormErrors = Partial<Record<Field, string>>;

// An amount as typed, in whole pesewas or cents (M-1).
function toMinor(text: string, context: z.RefinementCtx): number {
  const result = parseAmount(text);
  if (!result.ok) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.minor;
}
const requiredAmount = z.string().transform(toMinor);
// An empty field means "not typed" (null).
const optionalAmount = z.string().transform((text, context) => (text.trim() === "" ? null : toMinor(text, context)));

const transactionFormSchema = z.object({
  kind: z.enum(ENTRY_KINDS, { error: "Choose expense or income." }),
  amount: requiredAmount,
  currency: z.enum(CURRENCIES, { error: "Choose GHS or USD." }),
  categoryId: z.uuid({ error: "Choose a category." }),
  accountId: z.uuid({ error: "Choose an account." }),
  // Any real date. Older spending may be added for history (D-30).
  occurredOn: z.string().refine(isIsoDate, "Enter a real date."),
  rate: z
    .string()
    .trim()
    .refine((text) => text === "" || isValidRate(text), "Enter a rate above 0 with at most 6 decimals, e.g. 11.67."),
  accountAmount: optionalAmount,
  note: z.string().trim().max(200, "Use 200 characters or fewer."),
});

// One rule set for the transaction form: the browser and the Server Action
// both run it, and the database checks again. Which of rate and account
// amount are needed depends on the account: see buildTransactionRow.
export function parseTransactionForm(
  raw: Record<string, unknown>,
): { ok: true; value: TransactionInput } | { ok: false; errors: TransactionFormErrors } {
  // Anything missing or not text (for example a file) counts as empty.
  const text = Object.fromEntries(
    TRANSACTION_FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""]),
  );
  const result = transactionFormSchema.safeParse(text);
  if (!result.success) {
    const errors: TransactionFormErrors = {};
    for (const issue of result.error.issues) {
      errors[issue.path[0] as Field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { amount, accountAmount, ...rest } = result.data;
  return { ok: true, value: { ...rest, amountMinor: amount, accountAmountMinor: accountAmount } };
}

export type TransactionRow = {
  kind: EntryKind;
  occurred_on: string;
  account_id: string;
  category_id: string;
  amount_minor: number;
  currency: Currency;
  fx_rate: string;
  fx_source: "none" | "auto" | "manual";
  fx_rate_date: string | null;
  amount_ghs_minor: number;
  account_amount_minor: number;
  note: string;
};

// A conversion whose result is too large to store gives null instead of
// throwing: valid amounts times valid rates can still overflow, and an
// exception while the form renders would crash it.
export function safeConvert(convert: () => number): number | null {
  try {
    const value = convert();
    return Math.abs(value) <= MAX_AMOUNT_MINOR ? value : null;
  } catch {
    return null;
  }
}

export const ACCOUNT_NOT_FOUND: TransactionFormErrors = { accountId: "Choose an account from the list." };

// The database row for a transaction (M-2 to M-7). `accountCurrency` is the
// chosen account's currency; `stored` is the stored rate for the date
// (pickRate), or null when there is none.
//
// - GHS: rate 1; the GHS value is the amount.
// - USD: needs a rate. It counts as "auto" when it is the stored rate, and
//   "manual" when the user typed another one (M-5).
// - The account amount is the amount when the currencies match. Otherwise
//   it is what the user typed, or else: the GHS value (M-7), or for GHS on
//   a USD account, GHS ÷ rate (D-36).
export function buildTransactionRow(
  input: TransactionInput,
  accountCurrency: Currency,
  stored: StoredRate | null,
): { ok: true; row: TransactionRow } | { ok: false; errors: TransactionFormErrors } {
  const usd = input.currency === "USD";
  const typedAccountAmount = accountCurrency !== input.currency ? input.accountAmountMinor : null;
  // USD always needs a rate. GHS on a USD account needs one only to suggest
  // the account amount, so a typed account amount is enough.
  if (input.rate === "" && (usd || (accountCurrency === "USD" && typedAccountAmount === null))) {
    return { ok: false, errors: { rate: "Enter the exchange rate: how many GHS for 1 USD." } };
  }

  const amountGhs = usd ? safeConvert(() => convertToGhs(input.amountMinor, input.rate)) : input.amountMinor;
  if (amountGhs === null) return { ok: false, errors: { amount: "The amount is too large." } };

  let accountAmount: number | null;
  if (accountCurrency === input.currency) accountAmount = input.amountMinor;
  else if (typedAccountAmount !== null) accountAmount = typedAccountAmount;
  else accountAmount = usd ? amountGhs : safeConvert(() => convertFromGhs(input.amountMinor, input.rate));
  if (accountAmount === null) return { ok: false, errors: { accountAmount: "The amount is too large." } };
  if (accountAmount < 1) {
    return {
      ok: false,
      errors: { accountAmount: `Enter the amount in ${accountCurrency} that the account changed by.` },
    };
  }

  const auto = usd && stored !== null && sameRate(input.rate, stored.rate);
  return {
    ok: true,
    row: {
      kind: input.kind,
      occurred_on: input.occurredOn,
      account_id: input.accountId,
      category_id: input.categoryId,
      amount_minor: input.amountMinor,
      currency: input.currency,
      fx_rate: usd ? input.rate : "1",
      fx_source: usd ? (auto ? "auto" : "manual") : "none",
      fx_rate_date: auto ? stored.rateDate : null,
      amount_ghs_minor: amountGhs,
      account_amount_minor: accountAmount,
      note: input.note,
    },
  };
}

// A database refusal on save, turned into a message for the right field.
// null: not about the form (for example no connection).
export function transactionSaveError(code: string | undefined, message: string): TransactionFormErrors | null {
  if (message.includes("account not found") || message.includes("transactions_account_id_fkey")) {
    return { accountId: "Choose an account from the list." };
  }
  if (message.includes("category not found") || message.includes("transactions_category_id_fkey")) {
    return { categoryId: "Choose a category from the list." };
  }
  if (code === "23514" && message.includes("category kind must match")) {
    return { categoryId: "Choose a category of the same type (expense or income)." };
  }
  // The account's currency changed between reading it and saving.
  if (code === "23514" && message.includes("account amount must equal")) {
    return { accountId: "This account's currency has changed. Choose the account again." };
  }
  return null;
}

// Everything needed to put a deleted transaction back exactly as it was
// (Undo, D-26). Checked again before it is saved: it comes from the browser.
const snapshotSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ENTRY_KINDS),
  occurred_on: z.string().refine(isIsoDate),
  account_id: z.uuid(),
  category_id: z.uuid(),
  amount_minor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
  currency: z.enum(CURRENCIES),
  fx_rate: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,6})?$/)]),
  fx_source: z.enum(["none", "auto", "manual"]),
  fx_rate_date: z.string().refine(isIsoDate).nullable(),
  amount_ghs_minor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  account_amount_minor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
  note: z.string().max(200),
  // The recurring item that created it, so the daily job never creates the
  // same date again after Undo (build step 7).
  recurring_rule_id: z.uuid().nullable(),
  occurrence_date: z.string().refine(isIsoDate).nullable(),
});
export type TransactionSnapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(value: unknown): TransactionSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

// One row of the Activity list. `transfer` is set for a transfer (D-06).
export type ActivityItem = {
  id: string;
  kind: EntryKind | "transfer";
  occurredOn: string;
  amountMinor: number;
  currency: Currency;
  amountGhsMinor: number;
  note: string;
  categoryLabel: string;
  accountName: string;
  accountId: string;
  transfer: { toAccountId: string; toAccountName: string; receivedMinor: number; toCurrency: Currency } | null;
};

// Search the note, category and accounts, ignoring upper and lower case.
export function matchesSearch(item: ActivityItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${item.note} ${item.categoryLabel} ${item.accountName} ${item.transfer?.toAccountName ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

// The account filter: a transfer belongs to both of its accounts.
export function involvesAccount(item: ActivityItem, accountId: string): boolean {
  return item.accountId === accountId || item.transfer?.toAccountId === accountId;
}

// Total in and out for a list, in GHS (reports use the GHS value, M-2).
// Transfers are neither income nor spending (D-06); their fees are expenses.
export function totalsInGhs(items: ActivityItem[]): { inMinor: number; outMinor: number } {
  let inMinor = 0;
  let outMinor = 0;
  for (const item of items) {
    if (item.kind === "income") inMinor += item.amountGhsMinor;
    else if (item.kind === "expense") outMinor += item.amountGhsMinor;
  }
  return { inMinor, outMinor };
}

// Items grouped by day, newest day first. The items keep their order.
export function groupByDay(items: ActivityItem[]): { date: string; items: ActivityItem[] }[] {
  const days = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const list = days.get(item.occurredOn) ?? [];
    list.push(item);
    days.set(item.occurredOn, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, list]) => ({ date, items: list }));
}

export type CategoryOption = { id: string; label: string };

// The category picker for one kind: top level in its own order, each
// followed by its sub-categories ("Food › Groceries"). Archived categories
// are left out, except `keepId` (the category an old transaction uses).
export function categoryOptions(rows: CategoryRow[], kind: EntryKind, keepId?: string | null): CategoryOption[] {
  const usable = (row: CategoryRow) => !row.archived || row.id === keepId;
  const byName = (a: CategoryRow, b: CategoryRow) => a.name.localeCompare(b.name);
  const parents = rows
    .filter((row) => row.kind === kind && row.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
  const options: CategoryOption[] = [];
  for (const parent of parents) {
    if (usable(parent)) options.push({ id: parent.id, label: parent.name });
    for (const child of rows.filter((row) => row.parentId === parent.id).sort(byName)) {
      if (usable(child) && (usable(parent) || child.id === keepId)) {
        options.push({ id: child.id, label: categoryPath(rows, child.id) });
      }
    }
  }
  return options;
}

// Which extra fields the form shows: the rate when USD is involved, and the
// account amount when the account's currency is not the transaction's.
export function exchangeFields(currency: Currency, accountCurrency: Currency | null) {
  return {
    showRate: currency === "USD" || accountCurrency === "USD",
    showAccountAmount: accountCurrency !== null && accountCurrency !== currency,
  };
}

// Live suggestions while typing, from what is in the form so far. null when
// the typed text is not (yet) a valid amount or rate.
export function exchangePreview(
  amount: string,
  rate: string,
  currency: Currency,
  accountCurrency: Currency | null,
): { amountGhsMinor: number | null; accountAmountMinor: number | null } {
  const parsed = parseAmount(amount);
  if (!parsed.ok || !isValidRate(rate)) return { amountGhsMinor: null, accountAmountMinor: null };
  const amountGhs = currency === "USD" ? safeConvert(() => convertToGhs(parsed.minor, rate)) : parsed.minor;
  if (amountGhs === null) return { amountGhsMinor: null, accountAmountMinor: null };
  if (accountCurrency === null || accountCurrency === currency) {
    return { amountGhsMinor: amountGhs, accountAmountMinor: null };
  }
  return {
    amountGhsMinor: amountGhs,
    accountAmountMinor: currency === "USD" ? amountGhs : safeConvert(() => convertFromGhs(parsed.minor, rate)),
  };
}

// An account amount the user typed, with the currencies it was typed for.
export type TypedAccountAmount = { text: string; currency: Currency; accountCurrency: Currency };

// The typed account amount counts only while the transaction and account
// currencies are the ones it was typed for. After either changes, the
// number would be read in another currency, so the suggestion shows again.
export function keptAccountAmount(
  typed: TypedAccountAmount | null,
  currency: Currency,
  accountCurrency: Currency | null,
): string | null {
  return typed && typed.currency === currency && typed.accountCurrency === accountCurrency ? typed.text : null;
}

// Undo of a created item when its recurring item was deleted meanwhile: the
// link cannot come back, so the transaction is put back without it.
export function lostRecurringLink(message: string): boolean {
  return message.includes("recurring_rule_id_fkey") || message.includes("recurring item not found");
}
