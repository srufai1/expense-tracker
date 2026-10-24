import { describe, expect, it } from "vitest";

import {
  budgetFor,
  budgetLines,
  budgetSaveError,
  budgetStatus,
  parseBudgetForm,
  spendingByCategory,
  type BudgetRow,
} from "./budgets";
import type { CategoryRow } from "./categories";

const row = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  kind: "expense",
  parentId: null,
  systemKey: null,
  sortOrder: 0,
  archived: false,
  ...values,
});

const CATEGORIES = [
  row({ id: "food", name: "Food", sortOrder: 10 }),
  row({ id: "groc", name: "Groceries", parentId: "food" }),
  row({ id: "eat", name: "Eating out", parentId: "food" }),
  row({ id: "fun", name: "Entertainment", sortOrder: 20 }),
  row({ id: "tr", name: "Transport", sortOrder: 30 }),
  row({ id: "sal", name: "Salary", kind: "income" }),
];

const BUDGETS: BudgetRow[] = [
  { categoryId: "food", effectiveFrom: "2026-09-01", amountMinor: 200_000 },
  { categoryId: "food", effectiveFrom: "2026-11-01", amountMinor: 250_000 },
  { categoryId: "eat", effectiveFrom: "2026-10-01", amountMinor: 60_000 },
  { categoryId: "fun", effectiveFrom: "2026-10-01", amountMinor: 30_000 },
  { categoryId: "fun", effectiveFrom: "2026-12-01", amountMinor: 0 },
];

describe("budgetFor (§6.5)", () => {
  it("is the latest budget on or before the month, 0 without one", () => {
    expect(budgetFor(BUDGETS, "food", "2026-08")).toBe(0);
    expect(budgetFor(BUDGETS, "food", "2026-10")).toBe(200_000);
    expect(budgetFor(BUDGETS, "food", "2026-11")).toBe(250_000);
    expect(budgetFor(BUDGETS, "fun", "2027-01")).toBe(0);
  });
});

describe("budgetStatus (§7.3)", () => {
  it("is Over above the budget", () => {
    expect(budgetStatus(30_001, 30_000, 10, 31)).toMatchObject({ status: "over" });
  });

  it("is Watch at 90% used or more than 15 points ahead of pace", () => {
    // Day 25 of 31: pace 80.6%. 90% used is Watch even though behind pace.
    expect(budgetStatus(27_000, 30_000, 25, 31)).toMatchObject({ status: "watch" });
    // Day 10 of 31: pace 32.3%; 50% used is 17.7 points ahead.
    expect(budgetStatus(15_000, 30_000, 10, 31)).toMatchObject({ status: "watch" });
  });

  it("is OK otherwise, including exactly 15 points ahead", () => {
    // Day 10 of 30: pace 33.3%; 48.3% used is 15 points ahead.
    expect(budgetStatus(14_500, 30_000, 10, 30)).toMatchObject({ status: "ok" });
    expect(budgetStatus(0, 30_000, 1, 30)).toMatchObject({ status: "ok", usedPercent: 0 });
  });

  it("gives the used and pace percentages for the bar", () => {
    expect(budgetStatus(15_000, 30_000, 15, 30)).toEqual({ status: "ok", usedPercent: 50, pacePercent: 50 });
  });
});

describe("spendingByCategory", () => {
  it("adds GHS values per category, and a parent includes its sub-categories", () => {
    const spending = spendingByCategory(
      [
        { kind: "expense", categoryId: "groc", amountGhsMinor: 10_000 },
        { kind: "expense", categoryId: "eat", amountGhsMinor: 2_500 },
        { kind: "expense", categoryId: "food", amountGhsMinor: 1_000 },
        { kind: "income", categoryId: "sal", amountGhsMinor: 500_000 },
        { kind: "transfer", categoryId: null, amountGhsMinor: 9_999 },
      ],
      CATEGORIES,
    );
    expect(spending.get("food")).toBe(13_500);
    expect(spending.get("eat")).toBe(2_500);
    expect(spending.get("groc")).toBe(10_000);
    expect(spending.get("sal")).toBeUndefined();
  });
});

describe("budgetLines", () => {
  it("lists budgeted top-level categories with their budgeted sub-categories", () => {
    const spending = new Map([
      ["food", 150_000],
      ["eat", 30_000],
      ["fun", 31_000],
    ]);
    const lines = budgetLines(CATEGORIES, BUDGETS, spending, "2026-10", 24);
    expect(lines.map((line) => [line.categoryId, line.label, line.depth, line.spentMinor, line.budgetMinor, line.status])).toEqual([
      ["food", "Food", 0, 150_000, 200_000, "ok"],
      ["eat", "Eating out", 1, 30_000, 60_000, "ok"],
      ["fun", "Entertainment", 0, 31_000, 30_000, "over"],
    ]);
  });

  it("leaves out categories whose budget is 0 that month", () => {
    expect(budgetLines(CATEGORIES, BUDGETS, new Map(), "2026-12", 1).map((line) => line.categoryId)).toEqual(["food", "eat"]);
  });
});

describe("parseBudgetForm", () => {
  it("reads an amount (0 ends the budget) and a month", () => {
    expect(parseBudgetForm({ amount: "2,000", month: "2026-11" })).toEqual({
      ok: true,
      value: { amountMinor: 200_000, effectiveFrom: "2026-11-01" },
    });
    expect(parseBudgetForm({ amount: "0", month: "2026-11" })).toMatchObject({ ok: true, value: { amountMinor: 0 } });
  });

  it("refuses a negative amount or a wrong month", () => {
    expect(parseBudgetForm({ amount: "-5", month: "2026-13" })).toEqual({
      ok: false,
      errors: { amount: "The amount cannot be negative.", month: "Choose a month." },
    });
  });
});

describe("budgetSaveError", () => {
  it("explains a refused sub-category budget, with the month", () => {
    expect(
      budgetSaveError("23514", "budgets: the sub-category budgets add up to more than the category budget (2026-11)"),
    ).toEqual({
      amount:
        "The sub-category budgets would add up to more than the main category's budget in 2026-11. A sub-category budget needs a main category budget at least as big.",
    });
  });

  it("returns null for anything else", () => {
    expect(budgetSaveError(undefined, "fetch failed")).toBeNull();
  });
});
