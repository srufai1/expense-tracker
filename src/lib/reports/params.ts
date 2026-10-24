import { formatMonth, isIsoDate, shiftMonth } from "../dates";
import { addDays, customPeriod, daysBetween, periodFor, type Period } from "./periods";

// The report page's address (?period=week&date=… or ?period=custom&from=…&to=…),
// previous / next, and the period's name on screen.

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

// What the custom form starts with: the last 30 days.
const lastThirtyDays = (today: string): Period => ({ kind: "custom", first: addDays(today, -29), last: today });

// The period in the address. Anything missing or wrong means this week; a
// wrong custom period keeps the custom tab and says what is wrong.
export function parseReportParams(params: Params, today: string): { period: Period; error: string | null } {
  const kind = one(params.period);
  if (kind === "custom") {
    const from = one(params.from);
    const to = one(params.to);
    if (from === "" && to === "") return { period: lastThirtyDays(today), error: null };
    const custom = customPeriod(from, to);
    return custom.ok ? { period: custom.period, error: null } : { period: lastThirtyDays(today), error: custom.error };
  }
  const date = one(params.date);
  const around = isIsoDate(date) ? date : today;
  if (kind === "month" || kind === "year") return { period: periodFor(kind, around), error: null };
  return { period: periodFor("week", around), error: null };
}

// The period before (-1) or after (+1); a custom period moves by its length.
export function shiftPeriod(period: Period, delta: -1 | 1): Period {
  if (period.kind === "week") return periodFor("week", addDays(period.first, 7 * delta));
  if (period.kind === "month") return periodFor("month", `${shiftMonth(period.first.slice(0, 7), delta)}-01`);
  if (period.kind === "year") return periodFor("year", `${Number(period.first.slice(0, 4)) + delta}-01-01`);
  const length = daysBetween(period.first, period.last) + 1;
  return { kind: "custom", first: addDays(period.first, length * delta), last: addDays(period.last, length * delta) };
}

// The address query of a period, shared by the page and its downloads.
export function periodQuery(period: Period): string {
  return period.kind === "custom"
    ? `period=custom&from=${period.first}&to=${period.last}`
    : `period=${period.kind}&date=${period.first}`;
}

export function periodHref(period: Period): string {
  return `/reports?${periodQuery(period)}`;
}

// A fixed list: newer browsers write "Sept" for en-GB, older ones "Sep".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

// "19 – 25 Oct 2026", "28 Sep – 4 Oct 2026", "October 2026", "2026".
export function periodTitle(period: Period): string {
  if (period.kind === "month") return formatMonth(period.first.slice(0, 7));
  if (period.kind === "year") return period.first.slice(0, 4);
  const [firstYear, lastYear] = [period.first.slice(0, 4), period.last.slice(0, 4)];
  if (period.first === period.last) return `${day(period.first)} ${firstYear}`;
  if (firstYear !== lastYear) return `${day(period.first)} ${firstYear} – ${day(period.last)} ${lastYear}`;
  const sameMonth = period.first.slice(0, 7) === period.last.slice(0, 7);
  const start = sameMonth ? String(Number(period.first.slice(8, 10))) : day(period.first);
  return `${start} – ${day(period.last)} ${lastYear}`;
}

// The download's file name: "weekly-report-2026-10-19-to-2026-10-25.pdf".
export function downloadName(period: Period, extension: "pdf" | "xlsx"): string {
  if (period.kind === "month") return `monthly-report-${period.first.slice(0, 7)}.${extension}`;
  if (period.kind === "year") return `year-report-${period.first.slice(0, 4)}.${extension}`;
  const name = period.kind === "week" ? "weekly-report" : "report";
  return `${name}-${period.first}-to-${period.last}.${extension}`;
}
