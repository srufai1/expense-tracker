import { describe, expect, it } from "vitest";

import { dayLabel, formatMonth, isIsoDate, monthBounds, monthFromParam, shiftMonth, todayInAccra } from "./dates";

describe("todayInAccra", () => {
  it("gives the date in Accra as YYYY-MM-DD", () => {
    expect(todayInAccra(new Date("2026-10-23T09:30:00Z"))).toBe("2026-10-23");
  });

  it("uses Accra time (UTC+0), not the computer's time zone", () => {
    expect(todayInAccra(new Date("2026-10-23T23:59:59Z"))).toBe("2026-10-23");
    expect(todayInAccra(new Date("2026-10-24T00:00:00Z"))).toBe("2026-10-24");
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-10-23")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true); // leap year
  });

  it("rejects dates that do not exist or are badly written", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("23/10/2026")).toBe(false);
    expect(isIsoDate("2026-10-23T00:00")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("monthFromParam", () => {
  it("reads ?month=YYYY-MM, or falls back to this month", () => {
    expect(monthFromParam("2026-09", "2026-10-24")).toBe("2026-09");
    expect(monthFromParam(undefined, "2026-10-24")).toBe("2026-10");
    expect(monthFromParam("2026-13", "2026-10-24")).toBe("2026-10");
    expect(monthFromParam("26-9", "2026-10-24")).toBe("2026-10");
    expect(monthFromParam(["2026-09"], "2026-10-24")).toBe("2026-10");
  });
});

describe("monthBounds", () => {
  it("gives the first and last day of a month", () => {
    expect(monthBounds("2026-10")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(monthBounds("2026-09")).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
  });
});

describe("shiftMonth", () => {
  it("moves back and forward across years", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("formatMonth", () => {
  it("writes the month name and year", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
  });
});

describe("dayLabel", () => {
  it("says Today and Yesterday, then the weekday and date", () => {
    expect(dayLabel("2026-10-24", "2026-10-24")).toBe("Today");
    expect(dayLabel("2026-10-23", "2026-10-24")).toBe("Yesterday");
    expect(dayLabel("2026-10-20", "2026-10-24")).toBe("Tue 20 Oct");
    expect(dayLabel("2026-12-31", "2027-01-01")).toBe("Yesterday");
  });

  it("adds the year when it is not this year", () => {
    expect(dayLabel("2025-10-20", "2026-10-24")).toBe("Mon 20 Oct 2025");
  });
});
