import { describe, expect, it } from "vitest";

import type { CategoryRow } from "../categories";
import { buildReport } from "../reports/build";
import { periodFor } from "../reports/periods";
import { everythingSheets, exportTransactions, money, reportSheets, type TransactionRowForExport } from "./sheets";

const cat = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  kind: "expense",
  parentId: null,
  systemKey: null,
  sortOrder: 0,
  archived: false,
  ...values,
});
const CATEGORIES = [
  cat({ id: "food", name: "Food", sortOrder: 1 }),
  cat({ id: "eat", name: "Eating out", parentId: "food" }),
  cat({ id: "fees", name: "Fees & Charges", systemKey: "fees", sortOrder: 9 }),
  cat({ id: "sal", name: "Salary", kind: "income" }),
];
const ACCOUNTS = [
  { id: "cash", name: "Cash", currency: "GHS" as const },
  { id: "card", name: "Dollar card", currency: "USD" as const },
];

const row = (values: Partial<TransactionRowForExport>): TransactionRowForExport => ({
  id: "t",
  kind: "expense",
  occurred_on: "2026-10-20",
  account_id: "cash",
  category_id: "eat",
  to_account_id: null,
  amount_minor: 2_500,
  currency: "GHS",
  fx_rate: 1,
  amount_ghs_minor: 2_500,
  to_amount_minor: null,
  note: "",
  ...values,
});

const ROWS = [
  row({ id: "a", note: "Waakye" }),
  row({ id: "b", kind: "income", occurred_on: "2026-10-23", category_id: "sal", amount_minor: 500_000, amount_ghs_minor: 500_000 }),
  row({
    id: "c",
    kind: "expense",
    occurred_on: "2026-10-21",
    account_id: "card",
    amount_minor: 1_000,
    currency: "USD",
    fx_rate: 11.671489,
    amount_ghs_minor: 11_671,
  }),
  row({ id: "d", kind: "transfer", account_id: "card", to_account_id: "cash", category_id: null, amount_minor: 10_000, currency: "USD", fx_rate: 11.67, amount_ghs_minor: 116_700, to_amount_minor: 115_000 }),
  row({ id: "e", category_id: "fees", amount_minor: 150, amount_ghs_minor: 150, note: "Transfer fee" }),
  // Outside the week: not in the report's Transactions sheet.
  row({ id: "f", occurred_on: "2026-10-12" }),
];

describe("money", () => {
  it("turns pesewas into a GHS number for a spreadsheet cell", () => {
    expect(money(123_456)).toBe(1234.56);
    expect(money(-5)).toBe(-0.05);
    expect(money(0)).toBe(0);
  });
});

describe("exportTransactions", () => {
  it("adds the names, the rate and what was received, oldest first", () => {
    const items = exportTransactions(ROWS, ACCOUNTS, CATEGORIES);
    expect(items[0]).toMatchObject({ id: "f", occurredOn: "2026-10-12" });
    expect(items.find((t) => t.id === "c")).toEqual({
      id: "c",
      occurredOn: "2026-10-21",
      kind: "expense",
      categoryLabel: "Food › Eating out",
      accountName: "Dollar card",
      toAccountName: "",
      amountMinor: 1_000,
      currency: "USD",
      rate: "11.671489",
      amountGhsMinor: 11_671,
      receivedMinor: null,
      receivedCurrency: null,
      note: "",
    });
    expect(items.find((t) => t.id === "d")).toMatchObject({
      kind: "transfer",
      categoryLabel: "",
      toAccountName: "Cash",
      receivedMinor: 115_000,
      receivedCurrency: "GHS",
    });
  });
});

describe("reportSheets", () => {
  const period = periodFor("week", "2026-10-19");
  const transactions = exportTransactions(ROWS, ACCOUNTS, CATEGORIES);
  const report = buildReport({
    period,
    today: "2026-10-26",
    transactions: transactions.map((t) => ({
      id: t.id,
      kind: t.kind,
      occurredOn: t.occurredOn,
      categoryId: ROWS.find((r) => r.id === t.id)?.category_id ?? null,
      amountGhsMinor: t.amountGhsMinor,
      note: t.note,
    })),
    categories: CATEGORIES,
    budgets: [{ categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 10_000 }],
    goals: [{ id: "g", name: "Trip", targetMinor: 100_000, targetDate: "2026-12-31", archived: false, contributions: [] }],
    historyStartsOn: "2026-10-12",
  });
  const sheets = reportSheets(report, transactions, "19 – 25 Oct 2026");
  const sheet = (name: string) => sheets.find((s) => s.name === name);

  it("has a summary with the same numbers as the screen", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Categories", "Transactions", "Budgets", "Goals", "Suggestions"]);
    expect(sheet("Summary")?.rows).toEqual([
      ["Period", "19 – 25 Oct 2026"],
      ["Spent (GHS)", 143.21],
      ["Income (GHS)", 5000],
      ["Net (GHS)", 4856.79],
      ["Saved", "97%"],
      ["Previous period spent (GHS)", 25],
      ["Change from previous period", "+473%"],
      ["4-week average spent (GHS)", "not enough history yet"],
      ["Most spent on", "Food"],
      ["Least spent on", "Fees & Charges"],
      ["Biggest expense (GHS)", 116.71],
      ["Busiest day", "2026-10-21"],
      ["Fees (GHS)", 1.5],
    ]);
  });

  it("lists categories with sub-categories and share %", () => {
    expect(sheet("Categories")?.columns.map((c) => c.header)).toEqual(["Category", "Sub-category", "Spent (GHS)", "Share %"]);
    expect(sheet("Categories")?.rows).toEqual([
      ["Food", "", 141.71, 99],
      ["Food", "Eating out", 141.71, 99],
      ["Fees & Charges", "", 1.5, 1],
    ]);
  });

  it("lists only the period's transactions, with GHS values", () => {
    const rows = sheet("Transactions")?.rows ?? [];
    expect(rows.map((r) => r[0])).toEqual(["2026-10-20", "2026-10-20", "2026-10-21", "2026-10-20", "2026-10-23"].sort());
    expect(rows.find((r) => r[10] === "Waakye")).toEqual([
      "2026-10-20", "Expense", "Food › Eating out", "Cash", "", 25, "GHS", "", 25, null, "Waakye",
    ]);
    expect(rows.find((r) => r[1] === "Transfer")).toEqual([
      "2026-10-20", "Transfer", "", "Dollar card", "Cash", 100, "USD", "11.670000", 1167, 1150, "",
    ]);
  });

  it("has budgets, goals and suggestions when there are any", () => {
    // October to date includes 12 Oct: 25.00 + 25.00 + 116.71.
    expect(sheet("Budgets")?.rows).toEqual([["Food", 100, 166.71, -66.71, "Over"]]);
    // GHS 1,000 over the 10 weeks left (67 days) = GHS 100 a week.
    expect(sheet("Goals")?.rows).toEqual([["Trip", 1000, 0, 0, "2026-12-31", 100]]);
    expect(sheet("Suggestions")?.rows[0]).toEqual(["Food is over budget by GHS 66.71 for October."]);
  });

  it("leaves out empty sections", () => {
    const empty = buildReport({
      period,
      today: "2026-10-26",
      transactions: [],
      categories: CATEGORIES,
      budgets: [],
      goals: [],
      historyStartsOn: null,
    });
    expect(reportSheets(empty, [], "19 – 25 Oct 2026").map((s) => s.name)).toEqual(["Summary", "Categories", "Transactions"]);
  });
});

describe("everythingSheets (the backup, §11)", () => {
  const sheets = everythingSheets({
    accounts: [
      { name: "Cash", type: "cash", currency: "GHS", openingBalanceMinor: 50_000, openingBalanceOn: "2026-10-01", balanceMinor: 47_500, archived: false },
      { name: "Old card", type: "card", currency: "USD", openingBalanceMinor: 0, openingBalanceOn: "2026-01-01", balanceMinor: 0, archived: true },
    ],
    categories: CATEGORIES,
    transactions: exportTransactions(ROWS, ACCOUNTS, CATEGORIES),
    budgets: [{ categoryId: "eat", effectiveFrom: "2026-10-01", amountMinor: 60_000 }],
    goals: [
      {
        name: "Trip",
        targetMinor: 100_000,
        targetDate: "2026-12-31",
        archived: false,
        contributions: [{ occurredOn: "2026-10-20", amountMinor: 18_000, note: "Weekly" }],
      },
    ],
    recurring: [
      { what: "Rent", kind: "expense", amountMinor: 150_000, currency: "GHS", schedule: "Monthly on the 25th", startsOn: "2026-10-25", endsOn: null, nextRunOn: "2026-10-25", paused: false, note: "" },
    ],
  });
  const sheet = (name: string) => sheets.find((s) => s.name === name);

  it("has one sheet per kind of record", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "Accounts",
      "Categories",
      "Transactions",
      "Budgets",
      "Goals",
      "Goal contributions",
      "Recurring",
    ]);
  });

  it("writes every record readably, including archived ones", () => {
    expect(sheet("Accounts")?.rows).toEqual([
      ["Cash", "Cash", "GHS", 500, "2026-10-01", 475, "No"],
      ["Old card", "Card", "USD", 0, "2026-01-01", 0, "Yes"],
    ]);
    expect(sheet("Categories")?.rows).toEqual([
      ["Expense", "Food", "", "No"],
      ["Expense", "Food", "Eating out", "No"],
      ["Expense", "Fees & Charges", "", "No"],
      ["Income", "Salary", "", "No"],
    ]);
    expect(sheet("Transactions")?.rows).toHaveLength(ROWS.length);
    expect(sheet("Budgets")?.rows).toEqual([["Food › Eating out", "2026-10", 600]]);
    expect(sheet("Goals")?.rows).toEqual([["Trip", 1000, 180, "2026-12-31", "No"]]);
    expect(sheet("Goal contributions")?.rows).toEqual([["Trip", "2026-10-20", 180, "Weekly"]]);
    expect(sheet("Recurring")?.rows).toEqual([
      ["Rent", "Expense", 1500, "GHS", "Monthly on the 25th", "2026-10-25", "", "2026-10-25", "No", ""],
    ]);
  });
});

describe("reportSheets and exportTransactions: other cases", () => {
  it("writes a month's average, a fall, and a reached goal", () => {
    const tr = cat({ id: "tr", name: "Transport" });
    const rows = [
      row({ id: "1", occurred_on: "2026-07-10", category_id: "tr", amount_minor: 10_000, amount_ghs_minor: 10_000 }),
      row({ id: "2", occurred_on: "2026-08-10", category_id: "tr", amount_minor: 10_000, amount_ghs_minor: 10_000 }),
      row({ id: "3", occurred_on: "2026-09-10", category_id: "tr", amount_minor: 10_000, amount_ghs_minor: 10_000 }),
      row({ id: "4", occurred_on: "2026-10-10", category_id: "tr", amount_minor: 8_000, amount_ghs_minor: 8_000 }),
    ];
    const items = exportTransactions(rows, ACCOUNTS, [...CATEGORIES, tr]);
    const report = buildReport({
      period: periodFor("month", "2026-10-01"),
      today: "2026-11-02",
      transactions: items.map((t) => ({ id: t.id, kind: t.kind, occurredOn: t.occurredOn, categoryId: "tr", amountGhsMinor: t.amountGhsMinor, note: "" })),
      categories: [...CATEGORIES, tr],
      budgets: [],
      goals: [{ id: "g", name: "Phone", targetMinor: 1_000, targetDate: "2026-12-31", archived: false, contributions: [{ occurredOn: "2026-10-01", amountMinor: 1_000 }] }],
      historyStartsOn: "2026-07-01",
    });
    const sheets = reportSheets(report, items, "October 2026");
    const summary = sheets.find((s) => s.name === "Summary")?.rows ?? [];
    expect(summary).toContainEqual(["Change from previous period", "-20%"]);
    expect(summary).toContainEqual(["3-month average spent (GHS)", 100]);
    expect(sheets.find((s) => s.name === "Goals")?.rows).toEqual([["Phone", 10, 10, 100, "2026-12-31", null]]);
  });

  it("keeps a row whose account is missing from the list, with an empty name", () => {
    const [item] = exportTransactions(
      [row({ id: "x", kind: "transfer", account_id: "gone", to_account_id: "also-gone", category_id: null, to_amount_minor: 100 })],
      ACCOUNTS,
      CATEGORIES,
    );
    expect(item).toMatchObject({ accountName: "", toAccountName: "", receivedCurrency: "GHS" });
  });
});

describe("everythingSheets: categories order", () => {
  it("lists income sub-categories under their parent, by the user's order", () => {
    const sheets = everythingSheets({
      accounts: [],
      categories: [
        cat({ id: "inc", name: "Work", kind: "income", sortOrder: 2 }),
        cat({ id: "s2", name: "Bonus", kind: "income", parentId: "inc", sortOrder: 2 }),
        cat({ id: "s1", name: "Salary", kind: "income", parentId: "inc", sortOrder: 1, archived: true }),
        cat({ id: "gift", name: "Gifts", kind: "income", sortOrder: 2 }),
      ],
      transactions: [],
      budgets: [],
      goals: [],
      recurring: [],
    });
    expect(sheets.find((s) => s.name === "Categories")?.rows).toEqual([
      ["Income", "Gifts", "", "No"],
      ["Income", "Work", "", "No"],
      ["Income", "Work", "Salary", "Yes"],
      ["Income", "Work", "Bonus", "No"],
    ]);
  });
});
