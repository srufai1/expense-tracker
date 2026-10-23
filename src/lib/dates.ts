import { appConfig } from "@/config/app";

// "en-CA" writes dates as YYYY-MM-DD, the same format as Postgres `date`.
const accraDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: appConfig.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Today's date in Accra as "YYYY-MM-DD". Use this instead of the server's
// or phone's own clock settings, so every screen agrees on what "today" is.
export function todayInAccra(now: Date = new Date()): string {
  return accraDate.format(now);
}

// True for a real calendar date written as YYYY-MM-DD ("2026-02-30" is false).
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
