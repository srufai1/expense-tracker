import { describe, expect, it } from "vitest";

import type { BudgetRow } from "../budgets";
import type { CategoryRow } from "../categories";
import { allSuggestions, buildReport, type ReportGoal, type ReportInput, type ReportTransaction } from "./build";
import { periodFor } from "./periods";

// One realistic week, worked out by hand (DESIGN §7). Amounts are pesewas.

const cat = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  kind: "expense",
  parentId: null,
  systemKey: null,
  sortOrder: 0,
  archived: false,
  ...values,
});

const CATEGORIES: CategoryRow[] = [
  cat({ id: "food", name: "Food", sortOrder: 10 }),
  cat({ id: "groc", name: "Groceries", parentId: "food" }),
  cat({ id: "eat", name: "Eating out", parentId: "food" }),
  cat({ id: "tr", name: "Transport", sortOrder: 20 }),
  cat({ id: "fun", name: "Entertainment", sortOrder: 30 }),
  cat({ id: "data", name: "Data & Airtime", sortOrder: 40 }),
  cat({ id: "fees", name: "Fees & Charges", systemKey: "fees", sortOrder: 1000 }),
  cat({ id: "sal", name: "Salary", kind: "income" }),
];

let next = 0;
const tx = (occurredOn: string, kind: ReportTransaction["kind"], categoryId: string | null, amountGhsMinor: number, note = "") => ({
  id: `t${++next}`,
  kind,
  occurredOn,
  categoryId,
  amountGhsMinor,
  note,
});

const THIS_WEEK = [
  tx("2026-10-19", "expense", "groc", 12_000),
  tx("2026-10-19", "expense", "eat", 8_000),
  tx("2026-10-20", "expense", "eat", 15_200, "Birthday dinner"),
  tx("2026-10-20", "expense", "tr", 3_000),
  tx("2026-10-23", "income", "sal", 500_000),
  tx("2026-10-23", "transfer", null, 30_000),
  tx("2026-10-23", "expense", "fees", 350),
  tx("2026-10-24", "expense", "fun", 7_000),
  tx("2026-10-24", "expense", "fees", 400),
];

// The 4 weeks before: Eating out 150 + 160 + 158 + 160 = GHS 628 (average 157).
const EARLIER = [
  tx("2026-09-22", "expense", "eat", 16_000),
  tx("2026-09-22", "expense", "groc", 10_000),
  tx("2026-09-30", "expense", "eat", 15_800),
  tx("2026-10-07", "expense", "eat", 16_000),
  tx("2026-10-14", "expense", "eat", 15_000),
  tx("2026-10-15", "expense", "groc", 20_000),
];

const BUDGETS: BudgetRow[] = [
  { categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 100_000 },
  { categoryId: "eat", effectiveFrom: "2026-10-01", amountMinor: 60_000 },
  { categoryId: "fun", effectiveFrom: "2026-10-01", amountMinor: 6_000 },
  { categoryId: "data", effectiveFrom: "2026-10-01", amountMinor: 10_000 },
];

const GOALS: ReportGoal[] = [
  {
    id: "laptop",
    name: "New laptop",
    targetMinor: 800_000,
    targetDate: "2027-03-31",
    archived: false,
    contributions: [
      { occurredOn: "2026-09-15", amountMinor: 200_000 },
      { occurredOn: "2026-10-12", amountMinor: 10_000 },
      { occurredOn: "2026-10-19", amountMinor: 10_000 },
    ],
  },
  {
    id: "fund",
    name: "Emergency fund",
    targetMinor: 100_000,
    targetDate: "2026-12-31",
    archived: false,
    contributions: [{ occurredOn: "2026-10-20", amountMinor: 100_000 }],
  },
  { id: "old", name: "Old phone", targetMinor: 50_000, targetDate: "2026-06-30", archived: true, contributions: [] },
];

const INPUT: ReportInput = {
  period: periodFor("week", "2026-10-19"),
  today: "2026-10-26",
  transactions: [...EARLIER, ...THIS_WEEK],
  categories: CATEGORIES,
  budgets: BUDGETS,
  goals: GOALS,
  historyStartsOn: "2026-09-01",
};

describe("buildReport: a week (§7.1)", () => {
  const report = buildReport(INPUT);

  it("adds up spending (fees in, transfers out), income, net and saved %", () => {
    expect(report.asOf).toBe("2026-10-25");
    expect(report.totals).toEqual({
      spendingMinor: 45_950,
      incomeMinor: 500_000,
      netMinor: 454_050,
      savedPercent: 91, // 454,050 ÷ 500,000 = 90.81%
    });
  });

  it("lists top-level categories with their sub-categories and share %, biggest first", () => {
    expect(report.categories).toEqual([
      {
        categoryId: "food",
        name: "Food",
        spentMinor: 35_200,
        sharePercent: 76.6,
        children: [
          { categoryId: "eat", name: "Eating out", spentMinor: 23_200, sharePercent: 50.5 },
          { categoryId: "groc", name: "Groceries", spentMinor: 12_000, sharePercent: 26.1 },
        ],
      },
      { categoryId: "fun", name: "Entertainment", spentMinor: 7_000, sharePercent: 15.2, children: [] },
      { categoryId: "tr", name: "Transport", spentMinor: 3_000, sharePercent: 6.5, children: [] },
      { categoryId: "fees", name: "Fees & Charges", spentMinor: 750, sharePercent: 1.6, children: [] },
    ]);
    expect(report.mostSpentOn).toEqual(["Food"]);
    expect(report.leastSpentOn).toEqual(["Fees & Charges"]);
  });

  it("finds the biggest expense, the busiest day and the fees", () => {
    expect(report.biggestExpense).toEqual({
      id: "t3",
      occurredOn: "2026-10-20",
      amountGhsMinor: 15_200,
      categoryLabel: "Food › Eating out",
      note: "Birthday dinner",
    });
    // 19 Oct: GHS 200 in 2 expenses; 20 Oct: GHS 182.
    expect(report.busiestDay).toEqual({ date: "2026-10-19", spentMinor: 20_000, count: 2 });
    expect(report.fees).toEqual({ count: 2, totalMinor: 750 });
  });

  it("has a bar per day with spending and income", () => {
    expect(report.chartUnit).toBe("day");
    expect(report.chart).toHaveLength(7);
    expect(report.chart[0]).toEqual({ first: "2026-10-19", last: "2026-10-19", spendingMinor: 20_000, incomeMinor: 0 });
    expect(report.chart[4]).toEqual({ first: "2026-10-23", last: "2026-10-23", spendingMinor: 350, incomeMinor: 500_000 });
  });

  it("compares with the previous week and the 4-week average (§7.2)", () => {
    expect(report.previous).toEqual({
      period: { kind: "week", first: "2026-10-12", last: "2026-10-18" },
      spendingMinor: 35_000,
      incomeMinor: 0,
      spendingChangePercent: 31, // 459.50 vs 350.00
    });
    // (260 + 158 + 160 + 350) ÷ 4 = GHS 232.00
    expect(report.average).toEqual({ status: "ok", periods: 4, spendingMinor: 23_200, incomeMinor: 0 });
  });

  it("shows October budgets month-to-date as of the week's Sunday (§7.3)", () => {
    expect(report.budgets?.month).toBe("2026-10");
    expect(report.budgets?.asOf).toBe("2026-10-25");
    expect(report.budgets?.lines.map((l) => [l.label, l.spentMinor, l.budgetMinor, l.status, l.usedPercent])).toEqual([
      ["Food", 86_200, 100_000, "ok", 86],
      ["Eating out", 54_200, 60_000, "watch", 90],
      ["Entertainment", 7_000, 6_000, "over", 117],
      ["Data & Airtime", 0, 10_000, "ok", 0],
    ]);
  });

  it("shows each active goal with what it needs per week", () => {
    expect(report.goals).toEqual([
      {
        id: "fund",
        name: "Emergency fund",
        targetMinor: 100_000,
        targetDate: "2026-12-31",
        savedMinor: 100_000,
        percent: 100,
        neededPerWeekMinor: null, // reached
        recentWeeklyMinor: 25_000,
      },
      {
        id: "laptop",
        name: "New laptop",
        targetMinor: 800_000,
        targetDate: "2027-03-31",
        savedMinor: 220_000,
        percent: 27.5,
        // GHS 5,800 left over 23 weeks (157 days) = GHS 252.17 a week.
        neededPerWeekMinor: 25_217,
        // GHS 200 in the last 4 weeks.
        recentWeeklyMinor: 5_000,
      },
    ]);
  });

  it("lists the days with nothing recorded", () => {
    expect(report.daysWithoutRecords).toEqual(["2026-10-21", "2026-10-22", "2026-10-25"]);
  });

  it("gives every suggestion that fires, in priority order (§7.4)", () => {
    expect(allSuggestions(report)).toEqual([
      "Entertainment is over budget by GHS 10.00 for October.",
      "Eating out is at 90% of its October budget with 6 days left.",
      "Food was GHS 352.00, 52% above your 4-week average (GHS 232.00).",
      "Eating out was GHS 232.00, 48% above your 4-week average (GHS 157.00).",
      "New laptop needs GHS 252.17 a week to reach GHS 8,000.00 by 31 Mar 2027.",
      "You kept 91% of this week's income. Moving GHS 252.17 to New laptop this week keeps it on track.",
      "Nothing was recorded on Wed, Thu and Sun. Did you forget some spending?",
    ]);
  });

  it("shows at most 5 suggestions", () => {
    expect(report.suggestions).toEqual(allSuggestions(report).slice(0, 5));
  });
});

describe("buildReport: edge cases", () => {
  it("says 'not enough history' instead of a misleading average", () => {
    const report = buildReport({ ...INPUT, historyStartsOn: "2026-09-22" });
    expect(report.average).toEqual({ status: "not_enough_history", periods: 4 });
    expect(allSuggestions(report).some((s) => s.includes("average"))).toBe(false);
  });

  it("has no average for a custom period or a year", () => {
    expect(buildReport({ ...INPUT, period: { kind: "custom", first: "2026-10-01", last: "2026-10-25" } }).average).toBeNull();
    expect(buildReport({ ...INPUT, period: periodFor("year", "2026-10-25") }).average).toBeNull();
  });

  it("shows '—' material for an empty period: no income, no categories, no most or least", () => {
    const report = buildReport({ ...INPUT, transactions: [], historyStartsOn: null, goals: [], budgets: [] });
    expect(report.totals).toEqual({ spendingMinor: 0, incomeMinor: 0, netMinor: 0, savedPercent: null });
    expect(report.categories).toEqual([]);
    expect(report.mostSpentOn).toEqual([]);
    expect(report.leastSpentOn).toEqual([]);
    expect(report.biggestExpense).toBeNull();
    expect(report.busiestDay).toBeNull();
    expect(report.previous.spendingChangePercent).toBeNull();
    expect(report.daysWithoutRecords).toEqual([]);
    expect(report.suggestions).toEqual([]);
  });

  it("names every category tied for most, and has no 'least' with only one category", () => {
    const tied = buildReport({
      ...INPUT,
      transactions: [tx("2026-10-20", "expense", "tr", 5_000), tx("2026-10-21", "expense", "fun", 5_000)],
    });
    expect(tied.mostSpentOn).toEqual(["Transport", "Entertainment"]);
    expect(tied.leastSpentOn).toEqual(["Transport", "Entertainment"]);
    const single = buildReport({ ...INPUT, transactions: [tx("2026-10-20", "expense", "tr", 5_000)] });
    expect(single.mostSpentOn).toEqual(["Transport"]);
    expect(single.leastSpentOn).toEqual([]);
  });

  it("counts a missing day only once it has passed, and not before history starts", () => {
    // Wednesday: only Monday and Tuesday have passed.
    const running = buildReport({ ...INPUT, today: "2026-10-21", transactions: [] });
    expect(running.daysWithoutRecords).toEqual(["2026-10-19", "2026-10-20"]);
    const newUser = buildReport({ ...INPUT, historyStartsOn: "2026-10-23" });
    expect(newUser.daysWithoutRecords).toEqual(["2026-10-25"]);
  });

  it("shows a budget month that has not started yet with nothing spent, and no 'near budget'", () => {
    // The week 28 Sep – 4 Oct, seen on 30 Sep: October budgets, nothing yet.
    const report = buildReport({
      ...INPUT,
      period: periodFor("week", "2026-09-28"),
      today: "2026-09-30",
    });
    expect(report.budgets?.asOf).toBeNull();
    expect(report.budgets?.lines.map((l) => [l.label, l.spentMinor, l.pacePercent])).toEqual([
      ["Food", 0, 0],
      ["Eating out", 0, 0],
      ["Entertainment", 0, 0],
      ["Data & Airtime", 0, 0],
    ]);
    expect(allSuggestions(report).join()).not.toContain("budget");
  });

  it("has no budget section in a year report", () => {
    expect(buildReport({ ...INPUT, period: periodFor("year", "2026-10-25") }).budgets).toBeNull();
  });

  it("does not count a goal's contributions after the report date", () => {
    const report = buildReport({ ...INPUT, period: periodFor("week", "2026-10-12"), today: "2026-10-26" });
    expect(report.goals.find((g) => g.id === "fund")?.savedMinor).toBe(0);
  });

  it("treats a goal past its target date as needing nothing more per week", () => {
    const late = buildReport({ ...INPUT, today: "2027-04-05", period: periodFor("week", "2027-03-29") });
    expect(late.goals.find((g) => g.id === "laptop")?.neededPerWeekMinor).toBeNull();
  });
});

describe("allSuggestions: the other rules (§7.4)", () => {
  const quiet = { ...INPUT, budgets: [], goals: [] };

  it("S-4: fees of GHS 20 or more, or 5 fee items, in a week", () => {
    const fees = Array.from({ length: 5 }, (_, i) => tx(`2026-10-${19 + i}`, "expense", "fees", 100));
    expect(allSuggestions(buildReport({ ...quiet, transactions: fees }))).toContain(
      "5 fees cost GHS 5.00 this week. Fewer, larger transfers could save money.",
    );
    const one = [tx("2026-10-20", "expense", "fees", 2_000)];
    expect(allSuggestions(buildReport({ ...quiet, transactions: one }))).toContain(
      "1 fee cost GHS 20.00 this week. Fewer, larger transfers could save money.",
    );
    const small = [tx("2026-10-20", "expense", "fees", 1_999)];
    expect(allSuggestions(buildReport({ ...quiet, transactions: small })).join()).not.toContain("fee");
  });

  it("S-6: a finished week at or below 90% of the 4-week average", () => {
    // Average GHS 232.00; this week GHS 204.00 = 12% less.
    const week = [...EARLIER, tx("2026-10-19", "expense", "tr", 20_400)];
    expect(allSuggestions(buildReport({ ...quiet, transactions: week }))).toContain(
      "You spent 12% less than your 4-week average. Well done.",
    );
    // Not while the week is still running.
    expect(allSuggestions(buildReport({ ...quiet, today: "2026-10-25", transactions: week })).join()).not.toContain("Well done");
    // Not for a week with no spending at all.
    expect(allSuggestions(buildReport({ ...quiet, transactions: EARLIER })).join()).not.toContain("Well done");
  });

  it("S-6 and S-3 for a month use the 3-month average", () => {
    const months = [
      tx("2026-07-10", "expense", "tr", 10_000),
      tx("2026-08-10", "expense", "tr", 10_000),
      tx("2026-09-10", "expense", "tr", 10_000),
      tx("2026-10-10", "expense", "tr", 8_000),
    ];
    const report = buildReport({
      ...quiet,
      period: periodFor("month", "2026-10-01"),
      today: "2026-11-02",
      transactions: months,
      historyStartsOn: "2026-07-01",
    });
    expect(allSuggestions(report)).toEqual(["You spent 20% less than your 3-month average. Well done."]);
  });

  it("S-3 needs both 30% and GHS 50 above the average, and an average above 0", () => {
    const jump = (amount: number) =>
      allSuggestions(buildReport({ ...quiet, transactions: [...EARLIER, tx("2026-10-20", "expense", "tr", amount)] }));
    // Transport has no average: no jump.
    expect(jump(50_000).join()).not.toContain("Transport was");
  });

  it("S-7 for another period names what the goal needs per week", () => {
    const month = buildReport({ ...INPUT, budgets: [], period: periodFor("month", "2026-10-01"), today: "2026-11-02" });
    expect(allSuggestions(month)).toContain("You kept 81% of this month's income. New laptop needs GHS 263.64 a week to stay on track.");
  });

  it("S-8 runs for weeks only", () => {
    const custom = buildReport({ ...quiet, period: { kind: "custom", first: "2026-10-19", last: "2026-10-25" } });
    expect(allSuggestions(custom).join()).not.toContain("Nothing was recorded");
  });
});
