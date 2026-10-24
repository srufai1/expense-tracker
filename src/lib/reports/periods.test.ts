import { describe, expect, it } from "vitest";

import {
  addDays,
  averageWindows,
  budgetMonthFor,
  chartBuckets,
  chartUnit,
  customPeriod,
  dataRange,
  daysBetween,
  periodFor,
  previousPeriod,
  type Period,
} from "./periods";

describe("addDays and daysBetween", () => {
  it("move by whole days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });
});

describe("periodFor (§7.2)", () => {
  it("week: Monday to Sunday around the date", () => {
    expect(periodFor("week", "2026-10-24")).toEqual({ kind: "week", first: "2026-10-19", last: "2026-10-25" });
    expect(periodFor("week", "2026-10-19")).toEqual({ kind: "week", first: "2026-10-19", last: "2026-10-25" });
    expect(periodFor("week", "2026-10-25")).toEqual({ kind: "week", first: "2026-10-19", last: "2026-10-25" });
  });

  it("month and year: the whole calendar month or year", () => {
    expect(periodFor("month", "2027-02-10")).toEqual({ kind: "month", first: "2027-02-01", last: "2027-02-28" });
    expect(periodFor("year", "2026-10-24")).toEqual({ kind: "year", first: "2026-01-01", last: "2026-12-31" });
  });
});

describe("customPeriod", () => {
  it("is any start and end, at most 366 days", () => {
    expect(customPeriod("2026-01-01", "2027-01-01")).toEqual({
      ok: true,
      period: { kind: "custom", first: "2026-01-01", last: "2027-01-01" },
    });
    expect(customPeriod("2026-01-01", "2027-01-02")).toEqual({ ok: false, error: "Choose at most 366 days." });
    expect(customPeriod("2026-10-24", "2026-10-23")).toEqual({
      ok: false,
      error: "The end date cannot be before the start date.",
    });
    expect(customPeriod("2026-02-30", "2026-03-01")).toEqual({ ok: false, error: "Enter real dates." });
  });
});

describe("previousPeriod (§7.2)", () => {
  it("is the week, month or year before", () => {
    expect(previousPeriod(periodFor("week", "2026-10-24"))).toEqual({ kind: "week", first: "2026-10-12", last: "2026-10-18" });
    expect(previousPeriod(periodFor("month", "2026-03-15"))).toEqual({ kind: "month", first: "2026-02-01", last: "2026-02-28" });
    expect(previousPeriod(periodFor("year", "2026-03-15"))).toEqual({ kind: "year", first: "2025-01-01", last: "2025-12-31" });
  });

  it("custom: the same number of days just before", () => {
    const custom: Period = { kind: "custom", first: "2026-10-10", last: "2026-10-19" };
    expect(previousPeriod(custom)).toEqual({ kind: "custom", first: "2026-09-30", last: "2026-10-09" });
  });
});

describe("averageWindows (§7.2)", () => {
  it("week: the 4 weeks before it", () => {
    expect(averageWindows(periodFor("week", "2026-10-24"))).toEqual([
      { first: "2026-09-21", last: "2026-09-27" },
      { first: "2026-09-28", last: "2026-10-04" },
      { first: "2026-10-05", last: "2026-10-11" },
      { first: "2026-10-12", last: "2026-10-18" },
    ]);
  });

  it("month: the 3 months before it", () => {
    expect(averageWindows(periodFor("month", "2026-01-20"))).toEqual([
      { first: "2025-10-01", last: "2025-10-31" },
      { first: "2025-11-01", last: "2025-11-30" },
      { first: "2025-12-01", last: "2025-12-31" },
    ]);
  });

  it("custom and year: no average", () => {
    expect(averageWindows(periodFor("year", "2026-01-20"))).toEqual([]);
    expect(averageWindows({ kind: "custom", first: "2026-10-01", last: "2026-10-05" })).toEqual([]);
  });
});

describe("chartBuckets (§7.2)", () => {
  it("week: 7 days; month: one per day", () => {
    const week = chartBuckets(periodFor("week", "2026-10-24"));
    expect(week.map((b) => b.first)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(week[0]).toEqual({ first: "2026-10-19", last: "2026-10-19" });
    expect(chartBuckets(periodFor("month", "2027-02-01"))).toHaveLength(28);
  });

  it("custom: per day up to 62 days, otherwise per week (Monday to Sunday, cut to the range)", () => {
    expect(chartBuckets({ kind: "custom", first: "2026-09-01", last: "2026-11-01" })).toHaveLength(62);
    const weeks = chartBuckets({ kind: "custom", first: "2026-09-02", last: "2026-11-03" });
    expect(weeks[0]).toEqual({ first: "2026-09-02", last: "2026-09-06" });
    expect(weeks[1]).toEqual({ first: "2026-09-07", last: "2026-09-13" });
    expect(weeks.at(-1)).toEqual({ first: "2026-11-02", last: "2026-11-03" });
    expect(weeks).toHaveLength(10);
  });

  it("year: 12 months", () => {
    const months = chartBuckets(periodFor("year", "2027-05-05"));
    expect(months).toHaveLength(12);
    expect(months[1]).toEqual({ first: "2027-02-01", last: "2027-02-28" });
  });
});

describe("chartUnit (§7.2)", () => {
  it("is the size of each bar, from the period itself", () => {
    expect(chartUnit(periodFor("week", "2026-10-24"))).toBe("day");
    expect(chartUnit(periodFor("month", "2026-10-24"))).toBe("day");
    expect(chartUnit(periodFor("year", "2026-10-24"))).toBe("month");
    expect(chartUnit({ kind: "custom", first: "2026-09-01", last: "2026-11-01" })).toBe("day");
    // Starts on a Sunday: the first bar is one day, the rest are weeks. Still "week".
    const sunday = { kind: "custom" as const, first: "2026-07-05", last: "2026-10-24" };
    expect(chartBuckets(sunday)[0]).toEqual({ first: "2026-07-05", last: "2026-07-05" });
    expect(chartUnit(sunday)).toBe("week");
  });
});

describe("budgetMonthFor (§7.3)", () => {
  it("is the month of the period's last day, month-to-date as of then or today", () => {
    // The week 28 Sep – 4 Oct shows October budgets.
    expect(budgetMonthFor({ kind: "week", first: "2026-09-28", last: "2026-10-04" }, "2026-10-10")).toEqual({
      month: "2026-10",
      asOf: "2026-10-04",
    });
    // A month still running: up to today.
    expect(budgetMonthFor(periodFor("month", "2026-10-01"), "2026-10-24")).toEqual({ month: "2026-10", asOf: "2026-10-24" });
    // That week while it is still September: nothing of October yet.
    expect(budgetMonthFor({ kind: "week", first: "2026-09-28", last: "2026-10-04" }, "2026-09-30")).toEqual({
      month: "2026-10",
      asOf: null,
    });
    expect(budgetMonthFor({ kind: "custom", first: "2026-08-10", last: "2026-09-12" }, "2026-10-24")).toEqual({
      month: "2026-09",
      asOf: "2026-09-12",
    });
  });

  it("a year report has no budget section", () => {
    expect(budgetMonthFor(periodFor("year", "2026-10-24"), "2026-10-24")).toBeNull();
  });
});

describe("dataRange", () => {
  it("covers the transactions of the period, the comparisons and the budget month", () => {
    // Week of 19 Oct: the 4-week average starts on 21 Sep.
    expect(dataRange(periodFor("week", "2026-10-24"), "2026-10-24")).toEqual({ first: "2026-09-21", last: "2026-10-25" });
    // A year: from the previous year.
    expect(dataRange(periodFor("year", "2026-10-24"), "2026-10-24")).toEqual({ first: "2025-01-01", last: "2026-12-31" });
    // A custom period long ago still loads the budget month's start.
    expect(dataRange({ kind: "custom", first: "2026-09-20", last: "2026-09-22" }, "2026-10-24")).toEqual({
      first: "2026-09-01",
      last: "2026-09-22",
    });
  });
});
