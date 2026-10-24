import { describe, expect, it } from "vitest";

import type { ReportPdfModel } from "./model";
import { renderReportPdf } from "./report-document";

const MODEL: ReportPdfModel = {
  heading: "Weekly report",
  title: "19 – 25 Oct 2026",
  madeOn: "Made on 26 Oct 2026 · Expense Tracker",
  summary: [
    ["Spent", "GHS 250.00"],
    ["Income", "GHS 100.00"],
    ["Net", "-GHS 150.00"],
    ["Saved", "-150%"],
  ],
  comparisons: ["Previous week: GHS 0.00 spent"],
  empty: null,
  chart: { title: "Spending per day", bars: [{ label: "Mon", heightPercent: 100 }, { label: "Tue", heightPercent: 0 }] },
  suggestions: ["Food is over budget by GHS 50.00 for October."],
  highlights: [["Most spent on", "Food"]],
  categories: [
    { name: "Food", amount: "GHS 200.00", share: "80.0%", child: false },
    { name: "Eating out", amount: "GHS 200.00", share: "80.0%", child: true },
  ],
  budgets: {
    title: "Budgets · October 2026, to 25 Oct",
    rows: [
      { name: "Food", spent: "GHS 200.00", budget: "GHS 150.00", status: "Over", usedPercent: 133 },
      { name: "Data", spent: "GHS 9.00", budget: "GHS 10.00", status: "Watch", usedPercent: 90 },
      { name: "Fun", spent: "GHS 1.00", budget: "GHS 10.00", status: "OK", usedPercent: 10 },
    ],
  },
  goals: [
    { name: "Trip", progress: "GHS 0.00 of GHS 1,000.00 (0%) by 31 Dec 2026", needed: "Needs GHS 100.00 a week" },
    { name: "Car", progress: "GHS 10.00 of GHS 10.00 (100%) by 31 Dec 2026", needed: null },
  ],
};

describe("renderReportPdf", () => {
  it("makes a real PDF file (D-20)", async () => {
    const pdf = await renderReportPdf(MODEL);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("also makes one for an empty period, and for a long report over several pages", async () => {
    const empty = await renderReportPdf({ ...MODEL, empty: "Nothing was recorded in this week.", suggestions: [], budgets: null, goals: [] });
    expect(empty.subarray(0, 5).toString()).toBe("%PDF-");
    const long = await renderReportPdf({
      ...MODEL,
      categories: Array.from({ length: 80 }, (_, i) => ({ name: `Category ${i}`, amount: "GHS 1.00", share: "1.0%", child: i % 2 === 1 })),
    });
    // Each page is a /Type /Page object in the file.
    expect(long.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
}, 30_000);
