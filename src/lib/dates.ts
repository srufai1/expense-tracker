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

// Months are written "YYYY-MM", like in the address (?month=2026-10).

// ?month=YYYY-MM from the address, or this month when it is missing or wrong.
export function monthFromParam(value: string | string[] | undefined, today: string): string {
  return typeof value === "string" && isIsoDate(`${value}-01`) ? value : today.slice(0, 7);
}

// The first and last day of a month, as YYYY-MM-DD.
export function monthBounds(month: string): { first: string; last: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// The month `delta` months before (negative) or after (positive).
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

// "October 2026".
export function formatMonth(month: string): string {
  return monthName.format(new Date(`${month}-01T00:00:00Z`));
}

// Fixed names, not Intl: newer devices write "Sept" in en-GB and older ones
// "Sep", so the same date could look different on the phone, the server,
// the PDF and the email.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "15 Sep".
export function shortDayMonth(date: string): string {
  return `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

// "15 Sep 2026".
export function formatDate(date: string): string {
  return `${shortDayMonth(date)} ${date.slice(0, 4)}`;
}

// "Today", "Yesterday", "Tue 20 Oct", or "Mon 20 Oct 2025" in another year.
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  const label = `${SHORT_WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDayMonth(date)}`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${date.slice(0, 4)}`;
}
