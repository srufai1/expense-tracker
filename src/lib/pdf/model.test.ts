import { describe, expect, it } from "vitest";

import type { CategoryRow } from "../categories";
import { buildReport, type ReportTransaction } from "../reports/build";
import { periodFor } from "../reports/periods";
import { pdfSafe, reportPdfModel } from "./model";

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
  cat({ id: "tr", name: "Transport", sortOrder: 2 }),
  cat({ id: "sal", name: "Salary", kind: "income" }),
];
const tx = (id: string, occurredOn: string, kind: ReportTransaction["kind"], categoryId: string, amount: number, note = "") => ({
  id,
  occurredOn,
  kind,
  categoryId,
  amountGhsMinor: amount,
  note,
});

const report = buildReport({
  period: periodFor("week", "2026-10-19"),
  today: "2026-10-26",
  transactions: [
    tx("a", "2026-10-19", "expense", "eat", 20_000, "Birthday dinner"),
    tx("b", "2026-10-20", "expense", "tr", 5_000),
    tx("c", "2026-10-23", "income", "sal", 10_000),
  ],
  categories: CATEGORIES,
  budgets: [{ categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 15_000 }],
  goals: [{ id: "g", name: "Trip", targetMinor: 100_000, targetDate: "2026-12-31", archived: false, contributions: [] }],
  historyStartsOn: "2026-10-19",
});

describe("pdfSafe", () => {
  it("swaps characters the built-in PDF font cannot print", () => {
    expect(pdfSafe("−GHS 150.00")).toBe("-GHS 150.00");
    expect(pdfSafe("Cash → Bank")).toBe("Cash -> Bank");
    // These print fine and stay.
    expect(pdfSafe("Food › Eating out · 19 – 25 Oct — 92%")).toBe("Food › Eating out · 19 – 25 Oct — 92%");
  });
});

describe("reportPdfModel (screen 10: the same numbers as screen 5)", () => {
  const model = reportPdfModel(report, { title: "19 – 25 Oct 2026", today: "2026-10-26", appName: "Expense Tracker" });

  it("names the report and when it was made", () => {
    expect(model.heading).toBe("Weekly report");
    expect(model.title).toBe("19 – 25 Oct 2026");
    expect(model.madeOn).toBe("Made on 26 Oct 2026 · Expense Tracker");
  });

  it("has the summary, with a plain minus for a negative net", () => {
    expect(model.summary).toEqual([
      ["Spent", "GHS 250.00"],
      ["Income", "GHS 100.00"],
      ["Net", "-GHS 150.00"],
      ["Saved", "-150%"],
    ]);
    expect(model.comparisons).toEqual(["Previous week: GHS 0.00 spent", "4-week average: not enough history yet"]);
  });

  it("has a bar per day, as a share of the highest", () => {
    expect(model.chart.title).toBe("Spending per day");
    expect(model.chart.bars.map((b) => [b.label, b.heightPercent])).toEqual([
      ["Mon", 100],
      ["Tue", 25],
      ["Wed", 0],
      ["Thu", 0],
      ["Fri", 0],
      ["Sat", 0],
      ["Sun", 0],
    ]);
  });

  it("has the highlights, categories, budgets, goals and suggestions", () => {
    expect(model.highlights).toEqual([
      ["Most spent on", "Food"],
      ["Least spent on", "Transport"],
      ["Biggest expense", "GHS 200.00 · Birthday dinner · Mon 19 Oct"],
      ["Busiest day", "Mon 19 Oct · GHS 200.00 in 1 expense"],
    ]);
    expect(model.categories).toEqual([
      { name: "Food", amount: "GHS 200.00", share: "80.0%", child: false },
      { name: "Eating out", amount: "GHS 200.00", share: "80.0%", child: true },
      { name: "Transport", amount: "GHS 50.00", share: "20.0%", child: false },
    ]);
    expect(model.budgets).toEqual({
      title: "Budgets · October 2026, to 25 Oct",
      rows: [{ name: "Food", spent: "GHS 200.00", budget: "GHS 150.00", status: "Over", usedPercent: 133 }],
    });
    expect(model.goals).toEqual([
      { name: "Trip", progress: "GHS 0.00 of GHS 1,000.00 (0%) by 31 Dec 2026", needed: "Needs GHS 100.00 a week" },
    ]);
    expect(model.suggestions[0]).toBe("Food is over budget by GHS 50.00 for October.");
  });

  it("says when nothing was recorded", () => {
    const empty = buildReport({ ...reportInputEmpty() });
    const emptyModel = reportPdfModel(empty, { title: "August 2026", today: "2026-10-26", appName: "Expense Tracker" });
    expect(emptyModel.heading).toBe("Monthly report");
    expect(emptyModel.empty).toBe("Nothing was recorded in this month.");
    expect(emptyModel.budgets).toBeNull();
    expect(emptyModel.comparisons).toEqual(["Previous month: GHS 0.00 spent", "3-month average: not enough history yet"]);
  });

  it("names custom and year reports, and their charts", () => {
    const year = reportPdfModel(buildReport({ ...reportInputEmpty(), period: periodFor("year", "2026-01-01") }), {
      title: "2026",
      today: "2026-10-26",
      appName: "X",
    });
    expect(year.heading).toBe("Year report");
    expect(year.chart.title).toBe("Spending per month");
    const custom = reportPdfModel({ ...report, period: { kind: "custom", first: "2026-10-01", last: "2026-12-31" } }, {
      title: "1 Oct – 31 Dec 2026",
      today: "2026-10-26",
      appName: "X",
    });
    expect(custom.heading).toBe("Report");
  });
});

function reportInputEmpty() {
  return {
    period: periodFor("month", "2026-08-01"),
    today: "2026-10-26",
    transactions: [],
    categories: CATEGORIES,
    budgets: [],
    goals: [],
    historyStartsOn: null,
  };
}

describe("reportPdfModel: a month with history, fees and a reached goal", () => {
  const month = buildReport({
    period: periodFor("month", "2026-10-01"),
    today: "2026-11-02",
    transactions: [
      tx("m1", "2026-07-10", "expense", "tr", 10_000),
      tx("m2", "2026-08-10", "expense", "tr", 10_000),
      tx("m3", "2026-09-10", "expense", "tr", 10_000),
      tx("m4", "2026-10-10", "expense", "tr", 6_000),
      tx("m5", "2026-10-10", "expense", "fees", 200),
    ],
    categories: [...CATEGORIES, cat({ id: "fees", name: "Fees & Charges", systemKey: "fees", sortOrder: 9 })],
    budgets: [],
    goals: [{ id: "g", name: "Phone", targetMinor: 1_000, targetDate: "2026-12-31", archived: false, contributions: [{ occurredOn: "2026-10-01", amountMinor: 1_000 }] }],
    historyStartsOn: "2026-07-01",
  });
  const model = reportPdfModel(month, { title: "October 2026", today: "2026-11-02", appName: "X" });

  it("shows a fall against the previous month and the 3-month average", () => {
    expect(model.comparisons).toEqual(["Previous month: GHS 100.00 spent (-38%)", "3-month average: GHS 100.00 spent"]);
  });

  it("names the biggest expense by its category when it has no note, and counts fees", () => {
    expect(model.highlights).toContainEqual(["Biggest expense", "GHS 60.00 · Transport · Sat 10 Oct"]);
    expect(model.highlights).toContainEqual(["Busiest day", "Sat 10 Oct · GHS 62.00 in 2 expenses"]);
    expect(model.highlights).toContainEqual(["Fees", "GHS 2.00 in 1"]);
  });

  it("labels every 7th day of a month, and a reached goal needs nothing more", () => {
    expect(model.chart.bars.map((b) => b.label).slice(0, 8)).toEqual(["1", "", "", "", "", "", "", "8"]);
    expect(model.goals).toEqual([{ name: "Phone", progress: "GHS 10.00 of GHS 10.00 (100%) by 31 Dec 2026", needed: null }]);
  });

  it("labels a year by month letters, and a long custom period per week", () => {
    const year = buildReport({ ...reportInputEmpty(), period: periodFor("year", "2026-01-01"), transactions: [tx("y", "2026-03-01", "expense", "tr", 100)] });
    const yearModel = reportPdfModel(year, { title: "2026", today: "2026-10-26", appName: "X" });
    expect(yearModel.chart.bars.map((b) => b.label).join("")).toBe("JFMAMJJASOND");
    const custom = buildReport({ ...reportInputEmpty(), period: { kind: "custom", first: "2026-07-01", last: "2026-10-20" } });
    expect(reportPdfModel(custom, { title: "Jul – Oct", today: "2026-10-26", appName: "X" }).chart.title).toBe("Spending per week");
  });

  it("shows a budget month that has not started yet without a date", () => {
    const early = buildReport({
      ...reportInputEmpty(),
      period: periodFor("week", "2026-09-28"),
      today: "2026-09-30",
      budgets: [{ categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 15_000 }],
    });
    expect(reportPdfModel(early, { title: "28 Sep – 4 Oct 2026", today: "2026-09-30", appName: "X" }).budgets?.title).toBe(
      "Budgets · October 2026",
    );
  });
});

describe("reportPdfModel: the same two fixes as the screen (PR #12 review)", () => {
  it("names a long custom chart per week even when it starts on a Sunday", () => {
    const sunday = buildReport({ ...reportInputEmpty(), period: { kind: "custom", first: "2026-07-05", last: "2026-10-24" } });
    expect(reportPdfModel(sunday, { title: "5 Jul – 24 Oct 2026", today: "2026-10-26", appName: "X" }).chart.title).toBe(
      "Spending per week",
    );
  });

  it("keeps suggestions for a period with nothing recorded", () => {
    // A quiet week, with an October budget already over.
    const quiet = buildReport({
      ...reportInputEmpty(),
      period: periodFor("week", "2026-10-19"),
      transactions: [tx("o", "2026-10-02", "expense", "eat", 20_000)],
      budgets: [{ categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 15_000 }],
      historyStartsOn: "2026-10-02",
    });
    const model = reportPdfModel(quiet, { title: "19 – 25 Oct 2026", today: "2026-10-26", appName: "X" });
    expect(model.empty).toBe("Nothing was recorded in this week.");
    expect(model.suggestions[0]).toBe("Food is over budget by GHS 50.00 for October.");
  });
});
