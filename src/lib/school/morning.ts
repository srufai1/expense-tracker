import { formatMoney } from "../money";

// Morning classes (D-54). Every amount is in pesewas (M-1).
//
// Each class day: JHS 1–3 students pay GHS 3.00. The school gets 0.50 for
// each student who paid the full 3.00; students who paid less add their
// money, but nothing for the school. On Friday the week is settled:
//   1. the school's share;
//   2. savings, from the last class day, after the school's share:
//      5 or 4 class days → all of it, 3 → half, 2 or fewer → none;
//   3. the rest is the teachers' money: the weekly deductions (markers,
//      assistant headmistress) come off, then it is shared equally;
//      leftover pesewas of an uneven share go to savings.

export const CLASSES = ["JHS 1", "JHS 2", "JHS 3"] as const;
export const MORNING_FEE_MINOR = 300;
export const MORNING_SCHOOL_MINOR = 50;

export type MorningDay = {
  date: string;
  noClass: boolean;
  // Students who paid the full fee, per class (JHS 1, 2, 3).
  full: [number, number, number];
  // Money from students who paid less than the fee, per class.
  lessMinor: [number, number, number];
  // The fee and the school's part, stored with each day.
  feeMinor: number;
  schoolMinor: number;
};

export type DayTotals = { fullPayers: number; collectedMinor: number; schoolMinor: number; afterSchoolMinor: number };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function dayTotals(day: MorningDay): DayTotals {
  if (day.noClass) return { fullPayers: 0, collectedMinor: 0, schoolMinor: 0, afterSchoolMinor: 0 };
  const fullPayers = sum(day.full);
  const collectedMinor = fullPayers * day.feeMinor + sum(day.lessMinor);
  const schoolMinor = fullPayers * day.schoolMinor;
  return { fullPayers, collectedMinor, schoolMinor, afterSchoolMinor: collectedMinor - schoolMinor };
}

// The deductions filled in for a week (the user can change them):
// 4–5 class days: markers 25, assistant headmistress 40;
// fewer: no markers, assistant headmistress 25.
export function defaultDeductions(classDays: number): { markersMinor: number; assistantMinor: number } {
  return classDays >= 4 ? { markersMinor: 2500, assistantMinor: 4000 } : { markersMinor: 0, assistantMinor: 2500 };
}

export type SavingsRule = "all" | "half" | "none";

export type WeekSettlement = {
  classDays: number;
  collectedMinor: number;
  schoolMinor: number;
  savingsRule: SavingsRule;
  // The class day the savings come from, or null when there are none.
  savingsDay: string | null;
  // Saved this week, including the leftover pesewas.
  savingsMinor: number;
  leftoverMinor: number;
  // After the school's share and the savings, before the deductions.
  teachersMinor: number;
  toShareMinor: number;
  eachMinor: number;
};

export function settleWeek({
  days,
  markersMinor,
  assistantMinor,
  sharers,
}: {
  days: MorningDay[];
  markersMinor: number;
  assistantMinor: number;
  sharers: number;
}): { ok: true; value: WeekSettlement } | { ok: false; error: string } {
  const classDays = days.filter((day) => !day.noClass).sort((a, b) => a.date.localeCompare(b.date));
  if (classDays.length === 0) return { ok: false, error: "There was no class this week, so there is nothing to share." };
  if (sharers < 1) return { ok: false, error: "Choose at least one person to share." };

  const totals = classDays.map(dayTotals);
  const collectedMinor = sum(totals.map((t) => t.collectedMinor));
  const schoolMinor = sum(totals.map((t) => t.schoolMinor));
  const afterSchoolMinor = collectedMinor - schoolMinor;

  const savingsRule: SavingsRule = classDays.length >= 4 ? "all" : classDays.length === 3 ? "half" : "none";
  const lastAfterSchool = totals[totals.length - 1].afterSchoolMinor;
  // An odd pesewa when halving goes to savings, like the leftover below.
  const daySavingsMinor =
    savingsRule === "all" ? lastAfterSchool : savingsRule === "half" ? Math.ceil(lastAfterSchool / 2) : 0;

  const teachersMinor = afterSchoolMinor - daySavingsMinor;
  const toShareMinor = teachersMinor - markersMinor - assistantMinor;
  if (toShareMinor < 0) {
    return { ok: false, error: `The deductions are more than the teachers' money (${formatMoney(teachersMinor, "GHS")}).` };
  }
  const eachMinor = Math.floor(toShareMinor / sharers);
  const leftoverMinor = toShareMinor - eachMinor * sharers;

  return {
    ok: true,
    value: {
      classDays: classDays.length,
      collectedMinor,
      schoolMinor,
      savingsRule,
      savingsDay: savingsRule === "none" ? null : classDays[classDays.length - 1].date,
      savingsMinor: daySavingsMinor + leftoverMinor,
      leftoverMinor,
      teachersMinor,
      toShareMinor,
      eachMinor,
    },
  };
}
