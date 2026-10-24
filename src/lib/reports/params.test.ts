import { describe, expect, it } from "vitest";

import { downloadName, parseReportParams, periodHref, periodTitle, shiftPeriod } from "./params";
import { periodFor } from "./periods";

const TODAY = "2026-10-24";

describe("parseReportParams", () => {
  it("is this week when the address says nothing (or something wrong)", () => {
    const week = { period: periodFor("week", TODAY), error: null };
    expect(parseReportParams({}, TODAY)).toEqual(week);
    expect(parseReportParams({ period: "decade" }, TODAY)).toEqual(week);
    expect(parseReportParams({ period: "week", date: "2026-02-30" }, TODAY)).toEqual(week);
    expect(parseReportParams({ period: ["week", "month"] }, TODAY)).toEqual(week);
  });

  it("reads a week, month or year around a date", () => {
    expect(parseReportParams({ period: "month", date: "2026-09-10" }, TODAY).period).toEqual(periodFor("month", "2026-09-10"));
    expect(parseReportParams({ period: "year", date: "2025-03-01" }, TODAY).period).toEqual(periodFor("year", "2025-03-01"));
    expect(parseReportParams({ period: "week", date: "2026-10-01" }, TODAY).period).toEqual(periodFor("week", "2026-10-01"));
  });

  it("reads a custom period, or explains what is wrong with it", () => {
    expect(parseReportParams({ period: "custom", from: "2026-09-01", to: "2026-09-30" }, TODAY)).toEqual({
      period: { kind: "custom", first: "2026-09-01", last: "2026-09-30" },
      error: null,
    });
    // No dates yet: the last 30 days.
    expect(parseReportParams({ period: "custom" }, TODAY)).toEqual({
      period: { kind: "custom", first: "2026-09-25", last: "2026-10-24" },
      error: null,
    });
    expect(parseReportParams({ period: "custom", from: "2026-10-24", to: "2026-10-01" }, TODAY)).toEqual({
      period: { kind: "custom", first: "2026-09-25", last: "2026-10-24" },
      error: "The end date cannot be before the start date.",
    });
  });
});

describe("shiftPeriod (previous / next)", () => {
  it("moves by one week, month or year", () => {
    expect(shiftPeriod(periodFor("week", TODAY), -1)).toEqual(periodFor("week", "2026-10-17"));
    expect(shiftPeriod(periodFor("month", "2026-01-31"), -1)).toEqual(periodFor("month", "2025-12-01"));
    expect(shiftPeriod(periodFor("year", TODAY), 1)).toEqual(periodFor("year", "2027-01-01"));
  });

  it("moves a custom period by its own length", () => {
    expect(shiftPeriod({ kind: "custom", first: "2026-10-01", last: "2026-10-10" }, 1)).toEqual({
      kind: "custom",
      first: "2026-10-11",
      last: "2026-10-20",
    });
    expect(shiftPeriod({ kind: "custom", first: "2026-10-01", last: "2026-10-10" }, -1)).toEqual({
      kind: "custom",
      first: "2026-09-21",
      last: "2026-09-30",
    });
  });
});

describe("periodHref", () => {
  it("is the address of a report", () => {
    expect(periodHref(periodFor("week", TODAY))).toBe("/reports?period=week&date=2026-10-19");
    expect(periodHref(periodFor("month", TODAY))).toBe("/reports?period=month&date=2026-10-01");
    expect(periodHref({ kind: "custom", first: "2026-09-01", last: "2026-09-30" })).toBe(
      "/reports?period=custom&from=2026-09-01&to=2026-09-30",
    );
  });
});

describe("periodTitle", () => {
  it("names the period the short way", () => {
    expect(periodTitle(periodFor("week", TODAY))).toBe("19 – 25 Oct 2026");
    expect(periodTitle(periodFor("week", "2026-09-30"))).toBe("28 Sep – 4 Oct 2026");
    expect(periodTitle(periodFor("week", "2026-12-31"))).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(periodTitle(periodFor("month", TODAY))).toBe("October 2026");
    expect(periodTitle(periodFor("year", TODAY))).toBe("2026");
    expect(periodTitle({ kind: "custom", first: "2026-10-05", last: "2026-10-05" })).toBe("5 Oct 2026");
  });
});

describe("downloadName", () => {
  it("names a report file by its kind and dates", () => {
    expect(downloadName(periodFor("week", TODAY), "pdf")).toBe("weekly-report-2026-10-19-to-2026-10-25.pdf");
    expect(downloadName(periodFor("month", TODAY), "xlsx")).toBe("monthly-report-2026-10.xlsx");
    expect(downloadName(periodFor("year", TODAY), "pdf")).toBe("year-report-2026.pdf");
    expect(downloadName({ kind: "custom", first: "2026-09-01", last: "2026-09-30" }, "pdf")).toBe(
      "report-2026-09-01-to-2026-09-30.pdf",
    );
  });
});
