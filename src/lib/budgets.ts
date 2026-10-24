import type { CategoryRow } from "./categories";
import { isIsoDate } from "./dates";
import { parseAmount } from "./money";

// Monthly budgets in GHS (DESIGN §6.5, §7.3, D-16, D-25). Months are "YYYY-MM".

export type BudgetRow = { categoryId: string; effectiveFrom: string; amountMinor: number };

// The budget for a month: the latest row on or before it; 0 without one.
export function budgetFor(rows: BudgetRow[], categoryId: string, month: string): number {
  const first = `${month}-01`;
  let best: BudgetRow | null = null;
  for (const row of rows) {
    if (row.categoryId === categoryId && row.effectiveFrom <= first && (!best || row.effectiveFrom > best.effectiveFrom)) {
      best = row;
    }
  }
  return best?.amountMinor ?? 0;
}

export type BudgetStatus = "over" | "watch" | "ok";

// §7.3. Pace = day of the month ÷ days in the month.
// Over: spent > budget. Watch: spent ≥ 90% of the budget, or more than 15
// points ahead of pace. OK: everything else. The comparisons use whole
// numbers: with decimals, "exactly 15 points" could come out as 15.0000001.
export function budgetStatus(
  spentMinor: number,
  budgetMinor: number,
  dayOfMonth: number,
  daysInMonth: number,
): { status: BudgetStatus; usedPercent: number; pacePercent: number } {
  const usedPercent = Math.round((spentMinor * 100) / budgetMinor);
  const pacePercent = Math.round((dayOfMonth * 100) / daysInMonth);
  let status: BudgetStatus = "ok";
  if (spentMinor > budgetMinor) status = "over";
  else if (
    spentMinor * 10 >= budgetMinor * 9 ||
    // used% − pace% > 15, multiplied out by budget × days × 100
    spentMinor * daysInMonth * 100 - dayOfMonth * budgetMinor * 100 > 15 * budgetMinor * daysInMonth
  ) {
    status = "watch";
  }
  return { status, usedPercent, pacePercent };
}

// Spending per category in GHS (M-2). A top-level category includes its
// sub-categories. Only expenses count; transfers never do (D-06).
export function spendingByCategory(
  items: { kind: string; categoryId: string | null; amountGhsMinor: number }[],
  categories: CategoryRow[],
): Map<string, number> {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const totals = new Map<string, number>();
  const add = (id: string, amount: number) => totals.set(id, (totals.get(id) ?? 0) + amount);
  for (const item of items) {
    if (item.kind !== "expense" || !item.categoryId) continue;
    add(item.categoryId, item.amountGhsMinor);
    const parent = parentOf.get(item.categoryId);
    if (parent) add(parent, item.amountGhsMinor);
  }
  return totals;
}

export type BudgetLine = {
  categoryId: string;
  label: string;
  // 0: top-level category; 1: sub-category.
  depth: 0 | 1;
  spentMinor: number;
  budgetMinor: number;
  status: BudgetStatus;
  usedPercent: number;
  pacePercent: number;
};

const daysIn = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};

// The budget screen for one month: each top-level expense category with a
// budget, followed by its sub-categories that have their own budget.
export function budgetLines(
  categories: CategoryRow[],
  rows: BudgetRow[],
  spending: Map<string, number>,
  month: string,
  dayOfMonth: number,
): BudgetLine[] {
  const days = daysIn(month);
  const line = (category: CategoryRow, depth: 0 | 1): BudgetLine | null => {
    const budgetMinor = budgetFor(rows, category.id, month);
    if (budgetMinor === 0) return null;
    const spentMinor = spending.get(category.id) ?? 0;
    return { categoryId: category.id, label: category.name, depth, spentMinor, budgetMinor, ...budgetStatus(spentMinor, budgetMinor, dayOfMonth, days) };
  };
  const byOrder = (a: CategoryRow, b: CategoryRow) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const lines: BudgetLine[] = [];
  for (const parent of categories.filter((c) => c.kind === "expense" && c.parentId === null).sort(byOrder)) {
    const top = line(parent, 0);
    if (!top) continue;
    lines.push(top);
    for (const child of categories.filter((c) => c.parentId === parent.id).sort(byOrder)) {
      const sub = line(child, 1);
      if (sub) lines.push(sub);
    }
  }
  return lines;
}

export type BudgetFormErrors = Partial<Record<"amount" | "month", string>>;

// The budget form: a GHS amount per month (0 ends the budget) and the month
// it starts in.
export function parseBudgetForm(
  raw: Record<string, unknown>,
): { ok: true; value: { amountMinor: number; effectiveFrom: string } } | { ok: false; errors: BudgetFormErrors } {
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  const errors: BudgetFormErrors = {};
  const amount = parseAmount(text("amount"), { allowZero: true });
  if (!amount.ok) errors.amount = amount.error;
  const month = text("month");
  if (!/^\d{4}-\d{2}$/.test(month) || !isIsoDate(`${month}-01`)) errors.month = "Choose a month.";
  if (!amount.ok || errors.month) return { ok: false, errors };
  return { ok: true, value: { amountMinor: amount.minor, effectiveFrom: `${month}-01` } };
}

// A database refusal on save (D-25), turned into a message for the form.
export function budgetSaveError(code: string | undefined, message: string): BudgetFormErrors | null {
  const month = /add up to more than the category budget \((\d{4}-\d{2})\)/.exec(message)?.[1];
  if (code === "23514" && month) {
    return {
      amount: `The sub-category budgets would add up to more than the main category's budget in ${month}. A sub-category budget needs a main category budget at least as big.`,
    };
  }
  return null;
}
