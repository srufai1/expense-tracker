import { describe, expect, it } from "vitest";

import { dayTotals, defaultDeductions, settleWeek, type MorningDay } from "./morning";

// Morning classes (D-54): GHS 3.00 per student per day; the school gets 0.50
// for each student who paid the full 3.00 only.

const day = (date: string, full: [number, number, number], less: [number, number, number] = [0, 0, 0]): MorningDay => ({
  date,
  noClass: false,
  full,
  lessMinor: less,
  feeMinor: 300,
  schoolMinor: 50,
});
const noClass = (date: string): MorningDay => ({ ...day(date, [0, 0, 0]), noClass: true });

// The full week from the pictures: Mon 123, Tue 120, Wed 126, Thu 115, Fri 114.
const FULL_WEEK = [
  day("2026-10-19", [14, 14, 13]), // 41 full = 123.00
  day("2026-10-20", [14, 13, 13]), // 40 full = 120.00
  day("2026-10-21", [14, 14, 14]), // 42 full = 126.00
  day("2026-10-22", [13, 12, 12], [0, 400, 0]), // 37 full + 4.00 paid less = 115.00
  day("2026-10-23", [13, 13, 12]), // 38 full = 114.00
];

describe("dayTotals", () => {
  it("adds full payers and money from those who paid less; the school counts full payers only", () => {
    expect(dayTotals(FULL_WEEK[3])).toEqual({
      fullPayers: 37,
      collectedMinor: 11500,
      schoolMinor: 1850,
      afterSchoolMinor: 9650,
    });
  });

  it("is all zero on a no-class day", () => {
    expect(dayTotals(noClass("2026-10-23"))).toEqual({ fullPayers: 0, collectedMinor: 0, schoolMinor: 0, afterSchoolMinor: 0 });
  });
});

describe("defaultDeductions", () => {
  it("is markers 25 and assistant headmistress 40 in a week of 4 or 5 class days", () => {
    expect(defaultDeductions(5)).toEqual({ markersMinor: 2500, assistantMinor: 4000 });
    expect(defaultDeductions(4)).toEqual({ markersMinor: 2500, assistantMinor: 4000 });
  });

  it("is no markers and assistant headmistress 25 in a shorter week", () => {
    expect(defaultDeductions(3)).toEqual({ markersMinor: 0, assistantMinor: 2500 });
    expect(defaultDeductions(1)).toEqual({ markersMinor: 0, assistantMinor: 2500 });
  });
});

describe("settleWeek", () => {
  it("full week: school 99, savings all of Friday 95, 339 shared by 4 = 84.75 each", () => {
    const result = settleWeek({ days: FULL_WEEK, markersMinor: 2500, assistantMinor: 4000, sharers: 4 });
    expect(result).toEqual({
      ok: true,
      value: {
        classDays: 5,
        collectedMinor: 59800,
        schoolMinor: 9900,
        savingsRule: "all",
        savingsDay: "2026-10-23",
        savingsMinor: 9500,
        leftoverMinor: 0,
        teachersMinor: 40400,
        toShareMinor: 33900,
        eachMinor: 8475,
      },
    });
  });

  it("every pesewa is accounted for", () => {
    const result = settleWeek({ days: FULL_WEEK, markersMinor: 2500, assistantMinor: 4000, sharers: 4 });
    if (!result.ok) throw new Error("expected ok");
    const v = result.value;
    expect(v.schoolMinor + v.savingsMinor + 2500 + 4000 + v.eachMinor * 4).toBe(v.collectedMinor);
  });

  it("short week (Thu and Fri holidays): half of Wednesday to savings, no markers, 230 shared = 57.50 each", () => {
    const days = [...FULL_WEEK.slice(0, 3), noClass("2026-10-22"), noClass("2026-10-23")];
    const result = settleWeek({ days, markersMinor: 0, assistantMinor: 2500, sharers: 4 });
    expect(result).toEqual({
      ok: true,
      value: {
        classDays: 3,
        collectedMinor: 36900,
        schoolMinor: 6150,
        savingsRule: "half",
        savingsDay: "2026-10-21",
        savingsMinor: 5250,
        leftoverMinor: 0,
        teachersMinor: 25500,
        toShareMinor: 23000,
        eachMinor: 5750,
      },
    });
  });

  it("4 class days with Friday off: all of Thursday is saved", () => {
    const days = [...FULL_WEEK.slice(0, 4), noClass("2026-10-23")];
    const result = settleWeek({ days, markersMinor: 2500, assistantMinor: 4000, sharers: 4 });
    expect(result.ok && result.value.savingsDay).toBe("2026-10-22");
    // Thursday 115.00 − 18.50 = 96.50, plus 0.02 left over from 242.50 / 4.
    expect(result.ok && result.value.savingsMinor).toBe(9652);
  });

  it("4 class days with Monday off: savings still come from Friday", () => {
    const days = [noClass("2026-10-19"), ...FULL_WEEK.slice(1)];
    const result = settleWeek({ days, markersMinor: 2500, assistantMinor: 4000, sharers: 4 });
    expect(result.ok && result.value.savingsRule).toBe("all");
    expect(result.ok && result.value.savingsDay).toBe("2026-10-23");
  });

  it("2 class days or fewer: no savings", () => {
    const days = FULL_WEEK.slice(0, 2);
    const result = settleWeek({ days, markersMinor: 0, assistantMinor: 2500, sharers: 4 });
    expect(result.ok && result.value.savingsRule).toBe("none");
    // Only the 0.02 left over from 177.50 / 4.
    expect(result.ok && result.value.savingsMinor).toBe(2);
    expect(result.ok && result.value.leftoverMinor).toBe(2);
    expect(result.ok && result.value.savingsDay).toBeNull();
  });

  it("leftover pesewas of an uneven share go to savings", () => {
    // 339.00 shared by 3 = 113.00 each, exact; 339.01 would leave 0.01.
    const days = [...FULL_WEEK.slice(0, 4), { ...FULL_WEEK[4], lessMinor: [1, 0, 0] as [number, number, number] }];
    const result = settleWeek({ days, markersMinor: 2500, assistantMinor: 4000, sharers: 3 });
    if (!result.ok) throw new Error("expected ok");
    // Friday 114.01 − 19.00 = 95.01 saved; the teachers' 339.00 / 3 = 113.00.
    expect(result.value.eachMinor).toBe(11300);
    expect(result.value.savingsMinor).toBe(9501);

    const uneven = settleWeek({ days: FULL_WEEK, markersMinor: 2500, assistantMinor: 4000, sharers: 7 });
    if (!uneven.ok) throw new Error("expected ok");
    // 339.00 / 7 = 48.428…: 48.42 each, 0.06 left over, added to savings.
    expect(uneven.value.eachMinor).toBe(4842);
    expect(uneven.value.leftoverMinor).toBe(6);
    expect(uneven.value.savingsMinor).toBe(9506);
  });

  it("an odd pesewa when halving goes to savings", () => {
    const days = [day("2026-10-19", [1, 0, 0]), day("2026-10-20", [1, 0, 0]), day("2026-10-21", [0, 0, 0], [101, 0, 0])];
    const result = settleWeek({ days, markersMinor: 0, assistantMinor: 0, sharers: 1 });
    if (!result.ok) throw new Error("expected ok");
    // Wednesday 1.01 after school (no full payers): savings 0.51, teachers 0.50.
    expect(result.value.savingsMinor).toBe(51);
    expect(result.value.teachersMinor).toBe(250 + 250 + 50);
  });

  it("refuses a week without class days, without sharers, or with deductions above the teachers' money", () => {
    expect(settleWeek({ days: [noClass("2026-10-19")], markersMinor: 0, assistantMinor: 0, sharers: 2 })).toEqual({
      ok: false,
      error: "There was no class this week, so there is nothing to share.",
    });
    expect(settleWeek({ days: FULL_WEEK, markersMinor: 0, assistantMinor: 0, sharers: 0 })).toEqual({
      ok: false,
      error: "Choose at least one person to share.",
    });
    expect(settleWeek({ days: FULL_WEEK, markersMinor: 40000, assistantMinor: 4000, sharers: 2 })).toEqual({
      ok: false,
      error: "The deductions are more than the teachers' money (GHS 404.00).",
    });
  });
});
