import { z } from "zod";

import { categoryPath, type CategoryRow } from "./categories";
import { isIsoDate } from "./dates";
import { CURRENCIES, MAX_AMOUNT_MINOR, parseAmount, type Currency } from "./money";

// DESIGN §6.3. Transfers are added in build step 6.
export const ENTRY_KINDS = ["expense", "income"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type TransactionInput = {
  kind: EntryKind;
  amountMinor: number;
  categoryId: string;
  accountId: string;
  occurredOn: string;
  note: string;
};

// The names of the fields in the transaction form, in screen order.
export const TRANSACTION_FIELDS = ["kind", "amount", "categoryId", "accountId", "occurredOn", "note"] as const;
type Field = (typeof TRANSACTION_FIELDS)[number];
export type TransactionFormErrors = Partial<Record<Field, string>>;

const transactionFormSchema = z.object({
  kind: z.enum(ENTRY_KINDS, { error: "Choose expense or income." }),
  amount: z.string().transform((text, context) => {
    const result = parseAmount(text);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.minor;
  }),
  categoryId: z.uuid({ error: "Choose a category." }),
  accountId: z.uuid({ error: "Choose an account." }),
  // Any real date. Older spending may be added for history (D-30).
  occurredOn: z.string().refine(isIsoDate, "Enter a real date."),
  note: z.string().trim().max(200, "Use 200 characters or fewer."),
});

// One rule set for the transaction form: the browser and the Server Action
// both run it, and the database checks again.
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
  const { amount, ...rest } = result.data;
  return { ok: true, value: { ...rest, amountMinor: amount } };
}

// The database row for a GHS transaction: rate 1, and the GHS value and
// the account amount are the amount itself (M-3, M-7).
export function ghsTransactionRow(input: TransactionInput) {
  return {
    kind: input.kind,
    occurred_on: input.occurredOn,
    account_id: input.accountId,
    category_id: input.categoryId,
    amount_minor: input.amountMinor,
    currency: "GHS" as const,
    fx_rate: 1,
    fx_source: "none" as const,
    fx_rate_date: null,
    amount_ghs_minor: input.amountMinor,
    account_amount_minor: input.amountMinor,
    note: input.note,
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
  if (code === "23514" && message.includes("account amount must equal")) {
    return { accountId: "This is a USD account. USD transactions come with exchange rates (build step 5)." };
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
});
export type TransactionSnapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(value: unknown): TransactionSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

// One row of the Activity list.
export type ActivityItem = {
  id: string;
  kind: EntryKind;
  occurredOn: string;
  amountMinor: number;
  currency: Currency;
  amountGhsMinor: number;
  note: string;
  categoryLabel: string;
  accountName: string;
  accountId: string;
};

// Search the note, category and account, ignoring upper and lower case.
export function matchesSearch(item: ActivityItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${item.note} ${item.categoryLabel} ${item.accountName}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

// Total in and out for a list, in GHS (reports use the GHS value, M-2).
export function totalsInGhs(items: ActivityItem[]): { inMinor: number; outMinor: number } {
  let inMinor = 0;
  let outMinor = 0;
  for (const item of items) {
    if (item.kind === "income") inMinor += item.amountGhsMinor;
    else outMinor += item.amountGhsMinor;
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
