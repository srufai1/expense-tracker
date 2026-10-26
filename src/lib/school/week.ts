import { isIsoDate } from "../dates";

// School weeks run Monday to Friday (D-54). Dates are "YYYY-MM-DD".

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = utc(date);
  next.setUTCDate(next.getUTCDate() + days);
  return iso(next);
}

// The Monday of the week a date is in. Saturday and Sunday belong to the
// week that just ended.
export function mondayOf(date: string): string {
  const weekday = utc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

// Monday to Friday of the week starting on `monday`.
export function schoolWeekDays(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

export function isWeekday(date: string): boolean {
  const weekday = utc(date).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function shiftWeek(monday: string, weeks: number): string {
  return addDays(monday, weeks * 7);
}

// ?week=YYYY-MM-DD from the address (any day of the week), or this week.
export function weekFromParam(value: string | string[] | undefined, today: string): string {
  return mondayOf(typeof value === "string" && isIsoDate(value) ? value : today);
}
