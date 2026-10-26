import { describe, expect, it } from "vitest";

import { isWeekday, mondayOf, schoolWeekDays, shiftWeek, weekFromParam } from "./week";

describe("school weeks (Monday to Friday)", () => {
  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-10-23")).toBe("2026-10-19"); // Friday
    expect(mondayOf("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // across a month end
  });

  it("lists Monday to Friday", () => {
    expect(schoolWeekDays("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  });

  it("knows a weekday", () => {
    expect(isWeekday("2026-10-23")).toBe(true);
    expect(isWeekday("2026-10-24")).toBe(false);
    expect(isWeekday("2026-10-25")).toBe(false);
  });

  it("moves by weeks", () => {
    expect(shiftWeek("2026-10-26", -1)).toBe("2026-10-19");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("reads ?week= from the address, or the current week", () => {
    expect(weekFromParam("2026-10-21", "2026-10-26")).toBe("2026-10-19");
    expect(weekFromParam(undefined, "2026-10-28")).toBe("2026-10-26");
    expect(weekFromParam("nonsense", "2026-10-28")).toBe("2026-10-26");
    expect(weekFromParam(["2026-10-21"], "2026-10-28")).toBe("2026-10-26");
  });
});
