import { isIsoDate, monthBounds, shiftMonth } from "../dates";

// Report periods and what they are compared with (DESIGN §7.2). Dates are
// "YYYY-MM-DD" in Accra (UTC+0), so plain UTC date maths is right.

export const PERIOD_KINDS = ["week", "month", "custom", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
export type Period = { kind: PeriodKind; first: string; last: string };
export type DateRange = { first: string; last: string };

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  const result = toDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// Days from `from` to `to`: 0 for the same day, negative when `to` is earlier.
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

// 1 = Monday … 7 = Sunday.
export function weekday(date: string): number {
  return toDate(date).getUTCDay() || 7;
}

function weekContaining(date: string): DateRange {
  const first = addDays(date, 1 - weekday(date));
  return { first, last: addDays(first, 6) };
}

// The week (Monday to Sunday), month or year around a date.
export function periodFor(kind: Exclude<PeriodKind, "custom">, date: string): Period {
  if (kind === "week") return { kind, ...weekContaining(date) };
  if (kind === "month") return { kind, ...monthBounds(date.slice(0, 7)) };
  const year = date.slice(0, 4);
  return { kind, first: `${year}-01-01`, last: `${year}-12-31` };
}

export const MAX_CUSTOM_DAYS = 366;

// A custom period: any start and end, at most 366 days (§7.2).
export function customPeriod(
  first: string,
  last: string,
): { ok: true; period: Period } | { ok: false; error: string } {
  if (!isIsoDate(first) || !isIsoDate(last)) return { ok: false, error: "Enter real dates." };
  if (last < first) return { ok: false, error: "The end date cannot be before the start date." };
  if (daysBetween(first, last) + 1 > MAX_CUSTOM_DAYS) return { ok: false, error: `Choose at most ${MAX_CUSTOM_DAYS} days.` };
  return { ok: true, period: { kind: "custom", first, last } };
}

// The period just before: the week, month or year before, or for a custom
// period the same number of days just before it.
export function previousPeriod(period: Period): Period {
  if (period.kind === "week") return { kind: "week", first: addDays(period.first, -7), last: addDays(period.last, -7) };
  if (period.kind === "month") return { kind: "month", ...monthBounds(shiftMonth(period.first.slice(0, 7), -1)) };
  if (period.kind === "year") return periodFor("year", addDays(period.first, -1));
  const length = daysBetween(period.first, period.last) + 1;
  return { kind: "custom", first: addDays(period.first, -length), last: addDays(period.first, -1) };
}

// The periods the average is taken over, oldest first: the 4 weeks before a
// week, the 3 months before a month. Custom periods and years have none.
export function averageWindows(period: Period): DateRange[] {
  if (period.kind === "week") {
    return [4, 3, 2, 1].map((back) => ({ first: addDays(period.first, -7 * back), last: addDays(period.last, -7 * back) }));
  }
  if (period.kind === "month") {
    return [3, 2, 1].map((back) => monthBounds(shiftMonth(period.first.slice(0, 7), -back)));
  }
  return [];
}

// The bars of the chart: one per day for a week, a month or a custom period
// of up to 62 days; one per week (Monday to Sunday, cut to the period) for a
// longer custom period; one per month for a year.
export function chartBuckets(period: Period): DateRange[] {
  const buckets: DateRange[] = [];
  if (period.kind === "year") {
    for (let month = period.first.slice(0, 7); buckets.length < 12; month = shiftMonth(month, 1)) {
      buckets.push(monthBounds(month));
    }
    return buckets;
  }
  const days = daysBetween(period.first, period.last) + 1;
  if (period.kind === "custom" && days > 62) {
    for (let first = period.first; first <= period.last; ) {
      const sunday = weekContaining(first).last;
      const last = sunday < period.last ? sunday : period.last;
      buckets.push({ first, last });
      first = addDays(last, 1);
    }
    return buckets;
  }
  for (let day = period.first; day <= period.last; day = addDays(day, 1)) buckets.push({ first: day, last: day });
  return buckets;
}

// The budget month a report shows (§7.3): the month of the period's last
// day, month-to-date as of that day or today, whichever is earlier. asOf is
// null when that month has not started yet. A year report has none.
export function budgetMonthFor(period: Period, today: string): { month: string; asOf: string | null } | null {
  if (period.kind === "year") return null;
  const month = period.last.slice(0, 7);
  const asOf = period.last < today ? period.last : today;
  return { month, asOf: asOf >= `${month}-01` ? asOf : null };
}

// The dates of the transactions one report needs: the period, the previous
// period, the average windows, and the budget month to date.
export function dataRange(period: Period, today: string): DateRange {
  const starts = [period.first, previousPeriod(period).first, ...averageWindows(period).map((w) => w.first)];
  const ends = [period.last];
  const budget = budgetMonthFor(period, today);
  if (budget) starts.push(`${budget.month}-01`);
  if (budget?.asOf) ends.push(budget.asOf);
  ends.sort();
  return { first: starts.sort()[0], last: ends[ends.length - 1] };
}
