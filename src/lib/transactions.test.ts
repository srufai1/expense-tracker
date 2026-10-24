import { describe, expect, it } from "vitest";

import type { CategoryRow } from "./categories";
import {
  buildTransactionRow,
  categoryOptions,
  exchangeFields,
  exchangePreview,
  keptAccountAmount,
  groupByDay,
  matchesSearch,
  parseSnapshot,
  parseTransactionForm,
  totalsInGhs,
  transactionSaveError,
  type ActivityItem,
  type TransactionInput,
} from "./transactions";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";

const valid = {
  kind: "expense",
  amount: "1,234.50",
  currency: "GHS",
  rate: "",
  accountAmount: "",
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
        currency: "GHS",
        categoryId: CATEGORY,
        accountId: ACCOUNT,
        occurredOn: "2026-10-20",
        rate: "",
        accountAmountMinor: null,
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
        currency: "EUR",
        categoryId: "",
        accountId: "nope",
        occurredOn: "2026-02-30",
        rate: "0",
        accountAmount: "-1",
        note: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      errors: {
        kind: "Choose expense or income.",
        amount: "The amount must be more than 0.",
        currency: "Choose GHS or USD.",
        categoryId: "Choose a category.",
        accountId: "Choose an account.",
        occurredOn: "Enter a real date.",
        rate: "Enter a rate above 0 with at most 6 decimals, e.g. 11.67.",
        accountAmount: "The amount cannot be negative.",
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

describe("parseTransactionForm: rate and account amount", () => {
  it("reads a typed rate and account amount", () => {
    const result = parseTransactionForm({ ...valid, currency: "USD", rate: " 11.67 ", accountAmount: "130.00" });
    expect(result.ok && result.value).toMatchObject({ currency: "USD", rate: "11.67", accountAmountMinor: 13000 });
  });
});

describe("buildTransactionRow", () => {
  const input = (values: Partial<TransactionInput> = {}): TransactionInput => ({
    kind: "expense",
    amountMinor: 999,
    currency: "USD",
    categoryId: CATEGORY,
    accountId: ACCOUNT,
    occurredOn: "2026-10-24",
    rate: "15.40",
    accountAmountMinor: null,
    note: "Netflix",
    ...values,
  });
  const stored = { rateDate: "2026-10-23", rate: "15.4" };

  it("GHS on a GHS account: rate 1, the same amount everywhere (M-3, M-7)", () => {
    expect(buildTransactionRow(input({ currency: "GHS", amountMinor: 2500, rate: "" }), "GHS", null)).toEqual({
      ok: true,
      row: {
        kind: "expense",
        occurred_on: "2026-10-24",
        account_id: ACCOUNT,
        category_id: CATEGORY,
        amount_minor: 2500,
        currency: "GHS",
        fx_rate: "1",
        fx_source: "none",
        fx_rate_date: null,
        amount_ghs_minor: 2500,
        account_amount_minor: 2500,
        note: "Netflix",
      },
    });
  });

  it("USD at the stored rate is 'auto' and keeps the rate's date (M-5)", () => {
    // USD 9.99 × 15.40 = GHS 153.846 → 15385 pesewas; the account is USD.
    const result = buildTransactionRow(input(), "USD", stored);
    expect(result.ok && result.row).toMatchObject({
      currency: "USD",
      fx_rate: "15.40",
      fx_source: "auto",
      fx_rate_date: "2026-10-23",
      amount_ghs_minor: 15385,
      account_amount_minor: 999,
    });
  });

  it("a typed rate that is not the stored one is 'manual', without a date", () => {
    const result = buildTransactionRow(input({ rate: "15.5" }), "USD", stored);
    expect(result.ok && result.row).toMatchObject({ fx_source: "manual", fx_rate_date: null, amount_ghs_minor: 15485 });
    const noneStored = buildTransactionRow(input(), "USD", null);
    expect(noneStored.ok && noneStored.row).toMatchObject({ fx_source: "manual", fx_rate_date: null });
  });

  it("USD on a GHS card: the account amount is the GHS value, or what the bank charged (M-7)", () => {
    const suggested = buildTransactionRow(input(), "GHS", stored);
    expect(suggested.ok && suggested.row.account_amount_minor).toBe(15385);
    const corrected = buildTransactionRow(input({ accountAmountMinor: 15500 }), "GHS", stored);
    expect(corrected.ok && corrected.row).toMatchObject({ amount_ghs_minor: 15385, account_amount_minor: 15500 });
  });

  it("GHS on a USD account: GHS ÷ rate, or the typed amount (D-36)", () => {
    // GHS 100.00 at 11.671489 = USD 8.57
    const suggested = buildTransactionRow(
      input({ currency: "GHS", amountMinor: 10000, rate: "11.671489" }),
      "USD",
      stored,
    );
    expect(suggested.ok && suggested.row).toMatchObject({
      currency: "GHS",
      fx_rate: "1",
      fx_source: "none",
      amount_ghs_minor: 10000,
      account_amount_minor: 857,
    });
    const typed = buildTransactionRow(input({ currency: "GHS", amountMinor: 10000, rate: "", accountAmountMinor: 860 }), "USD", null);
    expect(typed.ok && typed.row.account_amount_minor).toBe(860);
  });

  it("ignores a typed account amount when the currencies match", () => {
    const result = buildTransactionRow(input({ accountAmountMinor: 5 }), "USD", stored);
    expect(result.ok && result.row.account_amount_minor).toBe(999);
  });

  it("needs a rate for USD, and for GHS on a USD account without a typed amount", () => {
    const needRate = { ok: false, errors: { rate: "Enter the exchange rate: how many GHS for 1 USD." } };
    expect(buildTransactionRow(input({ rate: "" }), "USD", stored)).toEqual(needRate);
    expect(buildTransactionRow(input({ rate: "" }), "GHS", stored)).toEqual(needRate);
    expect(buildTransactionRow(input({ currency: "GHS", rate: "" }), "USD", stored)).toEqual(needRate);
  });

  it("refuses an account amount that rounds to nothing, or results that are too large", () => {
    // GHS 0.04 at 10 = USD 0.004 → 0 cents
    expect(buildTransactionRow(input({ currency: "GHS", amountMinor: 4, rate: "10" }), "USD", null)).toEqual({
      ok: false,
      errors: { accountAmount: "Enter the amount in USD that the account changed by." },
    });
    expect(buildTransactionRow(input({ amountMinor: 99_999_999_999, rate: "2" }), "USD", null)).toEqual({
      ok: false,
      errors: { amount: "The amount is too large." },
    });
    expect(
      buildTransactionRow(input({ currency: "GHS", amountMinor: 99_999_999_999, rate: "0.5" }), "USD", null),
    ).toEqual({ ok: false, errors: { accountAmount: "The amount is too large." } });
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
      accountId: "This account's currency has changed. Choose the account again.",
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

describe("exchangeFields", () => {
  it("shows the rate when USD is involved, and the account amount when currencies differ", () => {
    expect(exchangeFields("GHS", "GHS")).toEqual({ showRate: false, showAccountAmount: false });
    expect(exchangeFields("USD", "USD")).toEqual({ showRate: true, showAccountAmount: false });
    expect(exchangeFields("USD", "GHS")).toEqual({ showRate: true, showAccountAmount: true });
    expect(exchangeFields("GHS", "USD")).toEqual({ showRate: true, showAccountAmount: true });
    expect(exchangeFields("GHS", null)).toEqual({ showRate: false, showAccountAmount: false });
  });
});

describe("exchangePreview", () => {
  it("gives the GHS value of a USD amount", () => {
    expect(exchangePreview("9.99", "15.40", "USD", "USD")).toEqual({ amountGhsMinor: 15385, accountAmountMinor: null });
  });

  it("suggests the account amount when the currencies differ (M-7, D-36)", () => {
    expect(exchangePreview("9.99", "15.40", "USD", "GHS")).toEqual({ amountGhsMinor: 15385, accountAmountMinor: 15385 });
    expect(exchangePreview("100", "11.671489", "GHS", "USD")).toEqual({ amountGhsMinor: 10000, accountAmountMinor: 857 });
  });

  it("gives nothing while the amount or rate is not valid yet", () => {
    expect(exchangePreview("", "15.40", "USD", "GHS")).toEqual({ amountGhsMinor: null, accountAmountMinor: null });
    expect(exchangePreview("9.99", "", "USD", "GHS")).toEqual({ amountGhsMinor: null, accountAmountMinor: null });
    expect(exchangePreview("9.999", "15", "USD", "GHS")).toEqual({ amountGhsMinor: null, accountAmountMinor: null });
  });
});

describe("conversion overflow (Codex review on PR #6)", () => {
  // Each value is valid alone, but the product is too large to store or
  // even to hold exactly in JavaScript. It must become a field error,
  // never an exception (which would crash the form while it renders).
  it("previews nothing instead of throwing", () => {
    expect(exchangePreview("999999999.99", "99999999", "USD", "GHS")).toEqual({
      amountGhsMinor: null,
      accountAmountMinor: null,
    });
    expect(exchangePreview("999999999.99", "0.000001", "GHS", "USD")).toEqual({
      amountGhsMinor: 99_999_999_999,
      accountAmountMinor: null,
    });
  });

  it("returns a field error from buildTransactionRow", () => {
    const base = {
      kind: "expense" as const,
      categoryId: CATEGORY,
      accountId: ACCOUNT,
      occurredOn: "2026-10-24",
      accountAmountMinor: null,
      note: "",
    };
    expect(
      buildTransactionRow({ ...base, amountMinor: 99_999_999_999, currency: "USD", rate: "99999999" }, "USD", null),
    ).toEqual({ ok: false, errors: { amount: "The amount is too large." } });
    expect(
      buildTransactionRow({ ...base, amountMinor: 99_999_999_999, currency: "GHS", rate: "0.000001" }, "USD", null),
    ).toEqual({ ok: false, errors: { accountAmount: "The amount is too large." } });
  });
});

describe("keptAccountAmount (Codex review on PR #6)", () => {
  const typed = { text: "8.57", currency: "GHS" as const, accountCurrency: "USD" as const };

  it("keeps a typed account amount while the currencies stay the same", () => {
    expect(keptAccountAmount(typed, "GHS", "USD")).toBe("8.57");
  });

  // Typed as USD 8.57 for a GHS expense on a USD account. After switching to
  // a USD expense on a GHS account, "8.57" would be read as GHS: drop it, so
  // the converted suggestion shows instead.
  it("drops it when the transaction or account currency changes", () => {
    expect(keptAccountAmount(typed, "USD", "GHS")).toBeNull();
    expect(keptAccountAmount(typed, "USD", "USD")).toBeNull();
    expect(keptAccountAmount(typed, "GHS", null)).toBeNull();
    expect(keptAccountAmount(null, "GHS", "USD")).toBeNull();
  });
});
