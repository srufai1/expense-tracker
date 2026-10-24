import { describe, expect, it } from "vitest";

import type { CategoryRow } from "./categories";
import {
  categoryOptions,
  ghsTransactionRow,
  groupByDay,
  matchesSearch,
  parseSnapshot,
  parseTransactionForm,
  totalsInGhs,
  transactionSaveError,
  type ActivityItem,
} from "./transactions";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";

const valid = {
  kind: "expense",
  amount: "1,234.50",
  categoryId: CATEGORY,
  accountId: ACCOUNT,
  occurredOn: "2026-10-20",
  note: "  Waakye and egg  ",
};

describe("parseTransactionForm", () => {
  it("reads a valid form into whole pesewas, with the note trimmed", () => {
    expect(parseTransactionForm(valid)).toEqual({
      ok: true,
      value: {
        kind: "expense",
        amountMinor: 123450,
        categoryId: CATEGORY,
        accountId: ACCOUNT,
        occurredOn: "2026-10-20",
        note: "Waakye and egg",
      },
    });
  });

  it("allows an empty note and an income", () => {
    const result = parseTransactionForm({ ...valid, kind: "income", note: "" });
    expect(result.ok && result.value.kind).toBe("income");
    expect(result.ok && result.value.note).toBe("");
  });

  it("gives one message per wrong field", () => {
    expect(
      parseTransactionForm({
        kind: "transfer",
        amount: "0",
        categoryId: "",
        accountId: "nope",
        occurredOn: "2026-02-30",
        note: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      errors: {
        kind: "Choose expense or income.",
        amount: "The amount must be more than 0.",
        categoryId: "Choose a category.",
        accountId: "Choose an account.",
        occurredOn: "Enter a real date.",
        note: "Use 200 characters or fewer.",
      },
    });
  });

  it("refuses negative amounts and more than 2 decimals", () => {
    expect(parseTransactionForm({ ...valid, amount: "-5" })).toMatchObject({
      ok: false,
      errors: { amount: "The amount cannot be negative." },
    });
    expect(parseTransactionForm({ ...valid, amount: "1.234" })).toMatchObject({
      ok: false,
      errors: { amount: "Use at most 2 decimal places." },
    });
  });

  it("treats missing or non-text fields as empty", () => {
    const result = parseTransactionForm({ kind: "expense", amount: 5 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.amount).toBe("Enter an amount, for example 12.50.");
  });
});

describe("ghsTransactionRow", () => {
  it("uses rate 1 and the same amount everywhere (M-3, M-7)", () => {
    const parsed = parseTransactionForm(valid);
    if (!parsed.ok) throw new Error("expected a valid form");
    expect(ghsTransactionRow(parsed.value)).toEqual({
      kind: "expense",
      occurred_on: "2026-10-20",
      account_id: ACCOUNT,
      category_id: CATEGORY,
      amount_minor: 123450,
      currency: "GHS",
      fx_rate: 1,
      fx_source: "none",
      fx_rate_date: null,
      amount_ghs_minor: 123450,
      account_amount_minor: 123450,
      note: "Waakye and egg",
    });
  });
});

describe("transactionSaveError", () => {
  it("points at the field the database refused", () => {
    expect(transactionSaveError("23503", "transactions: account not found")).toEqual({
      accountId: "Choose an account from the list.",
    });
    expect(transactionSaveError("23503", 'violates foreign key constraint "transactions_account_id_fkey"')).toEqual({
      accountId: "Choose an account from the list.",
    });
    expect(transactionSaveError("23503", "transactions: category not found")).toEqual({
      categoryId: "Choose a category from the list.",
    });
    expect(transactionSaveError("23503", 'violates foreign key constraint "transactions_category_id_fkey"')).toEqual({
      categoryId: "Choose a category from the list.",
    });
    expect(transactionSaveError("23514", "transactions: the category kind must match the transaction kind")).toEqual({
      categoryId: "Choose a category of the same type (expense or income).",
    });
    expect(transactionSaveError("23514", "the account amount must equal the amount in the same currency")).toEqual({
      accountId: "This is a USD account. USD transactions come with exchange rates (build step 5).",
    });
  });

  it("returns null for anything else", () => {
    expect(transactionSaveError(undefined, "fetch failed")).toBeNull();
    expect(transactionSaveError("23514", "something else")).toBeNull();
  });
});

describe("parseSnapshot", () => {
  const snapshot = {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "expense",
    occurred_on: "2026-10-20",
    account_id: ACCOUNT,
    category_id: CATEGORY,
    amount_minor: 2500,
    currency: "GHS",
    fx_rate: 1,
    fx_source: "none",
    fx_rate_date: null,
    amount_ghs_minor: 2500,
    account_amount_minor: 2500,
    note: "",
  };

  it("accepts a deleted transaction as the database returned it", () => {
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
    expect(parseSnapshot({ ...snapshot, currency: "USD", fx_rate: "15.405", fx_source: "auto", fx_rate_date: "2026-10-20" }))
      .not.toBeNull();
  });

  it("refuses anything that is not a real snapshot", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ ...snapshot, id: "1" })).toBeNull();
    expect(parseSnapshot({ ...snapshot, amount_minor: 0 })).toBeNull();
    expect(parseSnapshot({ ...snapshot, amount_minor: 1.5 })).toBeNull();
    expect(parseSnapshot({ ...snapshot, kind: "transfer" })).toBeNull();
    expect(parseSnapshot({ ...snapshot, fx_rate: "abc" })).toBeNull();
  });
});

const item = (values: Partial<ActivityItem> & { id: string }): ActivityItem => ({
  kind: "expense",
  occurredOn: "2026-10-20",
  amountMinor: 1000,
  currency: "GHS",
  amountGhsMinor: 1000,
  note: "",
  categoryLabel: "Food › Eating out",
  accountName: "MoMo",
  accountId: ACCOUNT,
  ...values,
});

describe("matchesSearch", () => {
  const lunch = item({ id: "a", note: "Waakye at Auntie Muni" });

  it("searches the note, category and account, ignoring case", () => {
    expect(matchesSearch(lunch, "waakye")).toBe(true);
    expect(matchesSearch(lunch, "EATING")).toBe(true);
    expect(matchesSearch(lunch, "momo")).toBe(true);
    expect(matchesSearch(lunch, "auntie food")).toBe(true); // every word, anywhere
    expect(matchesSearch(lunch, "")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(matchesSearch(lunch, "waakye fuel")).toBe(false);
  });
});

describe("totalsInGhs", () => {
  it("adds income and spending separately, using the GHS value (M-2)", () => {
    expect(
      totalsInGhs([
        item({ id: "a", amountGhsMinor: 1250 }),
        item({ id: "b", kind: "income", amountGhsMinor: 500000 }),
        item({ id: "c", currency: "USD", amountMinor: 999, amountGhsMinor: 15385 }),
      ]),
    ).toEqual({ inMinor: 500000, outMinor: 16635 });
    expect(totalsInGhs([])).toEqual({ inMinor: 0, outMinor: 0 });
  });
});

describe("groupByDay", () => {
  it("groups by date, newest day first, keeping the order inside a day", () => {
    const groups = groupByDay([
      item({ id: "a", occurredOn: "2026-10-20" }),
      item({ id: "b", occurredOn: "2026-10-22" }),
      item({ id: "c", occurredOn: "2026-10-20" }),
    ]);
    expect(groups.map((group) => [group.date, group.items.map((entry) => entry.id)])).toEqual([
      ["2026-10-22", ["b"]],
      ["2026-10-20", ["a", "c"]],
    ]);
  });
});

describe("categoryOptions", () => {
  const row = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
    kind: "expense",
    parentId: null,
    systemKey: null,
    sortOrder: 0,
    archived: false,
    ...values,
  });
  const ROWS = [
    row({ id: "tr", name: "Transport", sortOrder: 20 }),
    row({ id: "food", name: "Food", sortOrder: 10 }),
    row({ id: "groc", name: "Groceries", parentId: "food" }),
    row({ id: "eat", name: "Eating out", parentId: "food" }),
    row({ id: "old", name: "Old snacks", parentId: "food", archived: true }),
    row({ id: "gone", name: "Gone", sortOrder: 30, archived: true }),
    row({ id: "gone-child", name: "Gone child", parentId: "gone" }),
    row({ id: "sal", name: "Salary", kind: "income", sortOrder: 10 }),
  ];

  it("lists usable categories of one kind, each parent followed by its sub-categories", () => {
    expect(categoryOptions(ROWS, "expense")).toEqual([
      { id: "food", label: "Food" },
      { id: "eat", label: "Food › Eating out" },
      { id: "groc", label: "Food › Groceries" },
      { id: "tr", label: "Transport" },
    ]);
    expect(categoryOptions(ROWS, "income")).toEqual([{ id: "sal", label: "Salary" }]);
  });

  it("keeps the archived category an old transaction uses", () => {
    expect(categoryOptions(ROWS, "expense", "old").map((option) => option.id)).toContain("old");
    expect(categoryOptions(ROWS, "expense", "gone").map((option) => option.id)).toContain("gone");
    expect(categoryOptions(ROWS, "expense", "gone-child")).toContainEqual({ id: "gone-child", label: "Gone › Gone child" });
  });
});
