import { z } from "zod";

import { isIsoDate } from "./dates";
import { CURRENCIES, parseAmount, type Currency } from "./money";

// Recurring items: the schedule (DESIGN §6.6, D-11). Dates are "YYYY-MM-DD"
// in Accra (UTC+0), so plain UTC date maths is right.

export const FREQUENCIES = ["weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

// weekly: weekday 1 (Monday) … 7 (Sunday). monthly: day 1 … 31; a day the
// month does not have means its last day (the 31st in February is the 28th).
export type Schedule = { frequency: Frequency; weekday: number | null; dayOfMonth: number | null };

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const toText = (date: Date) => date.toISOString().slice(0, 10);

function addDays(date: string, days: number): string {
  const result = toDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return toText(result);
}

// The rule's day in a given month, never past the month's last day.
function dayInMonth(year: number, monthIndex: number, dayOfMonth: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return toText(new Date(Date.UTC(year, monthIndex, Math.min(dayOfMonth, lastDay))));
}

// The first date on or after `date` when the rule runs.
export function occurrenceOnOrAfter(schedule: Schedule, date: string): string {
  const start = toDate(date);
  if (schedule.frequency === "weekly") {
    const weekday = start.getUTCDay() || 7; // Sunday is 0 in JavaScript, 7 here
    return addDays(date, ((schedule.weekday ?? 1) - weekday + 7) % 7);
  }
  const day = schedule.dayOfMonth ?? 1;
  const thisMonth = dayInMonth(start.getUTCFullYear(), start.getUTCMonth(), day);
  return thisMonth >= date ? thisMonth : dayInMonth(start.getUTCFullYear(), start.getUTCMonth() + 1, day);
}

// The first date after `date` when the rule runs.
export function nextOccurrence(schedule: Schedule, date: string): string {
  return occurrenceOnOrAfter(schedule, addDays(date, 1));
}

// The most dates one run creates for one rule: enough to catch up a year of
// weekly items, and a stop if a date is ever wrong.
const MAX_DUE = 400;

// The dates to create today: from the next run date up to today (catching up
// on missed days, §6.6), never past the end date, none while paused.
export function dueDates(
  rule: Schedule & { nextRunOn: string; endsOn: string | null; paused: boolean },
  today: string,
): string[] {
  if (rule.paused) return [];
  const last = rule.endsOn !== null && rule.endsOn < today ? rule.endsOn : today;
  const dates: string[] = [];
  for (let date = rule.nextRunOn; date <= last && dates.length < MAX_DUE; date = nextOccurrence(rule, date)) {
    dates.push(date);
  }
  return dates;
}

// The first date to create for a new or changed rule (D-39): the first
// occurrence from its start date or today, whichever is later. Older dates
// are not created automatically.
export function firstRunOn(schedule: Schedule, startsOn: string, today: string): string {
  return occurrenceOnOrAfter(schedule, startsOn > today ? startsOn : today);
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKDAY_OPTIONS = WEEKDAYS.map((name, index) => ({ value: index + 1, name }));

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"}`;
}

// "Every Monday", "Monthly on the 25th", "Monthly on the 31st (or the last day)".
export function describeSchedule(schedule: Schedule): string {
  if (schedule.frequency === "weekly") return `Every ${WEEKDAYS[(schedule.weekday ?? 1) - 1]}`;
  const day = schedule.dayOfMonth ?? 1;
  return `Monthly on the ${ordinal(day)}${day > 28 ? " (or the last day)" : ""}`;
}

export const RULE_KINDS = ["expense", "income", "transfer"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export type RecurringInput = {
  kind: RuleKind;
  amountMinor: number;
  currency: Currency;
  // Expense and income only.
  categoryId: string | null;
  accountId: string;
  // Transfers only (D-38).
  toAccountId: string | null;
  frequency: Frequency;
  weekday: number | null;
  dayOfMonth: number | null;
  startsOn: string;
  endsOn: string | null;
  note: string;
};

// The names of the fields in the recurring form, in screen order.
export const RECURRING_FIELDS = [
  "kind",
  "amount",
  "currency",
  "categoryId",
  "accountId",
  "toAccountId",
  "frequency",
  "weekday",
  "dayOfMonth",
  "startsOn",
  "endsOn",
  "note",
] as const;
type Field = (typeof RECURRING_FIELDS)[number];
export type RecurringFormErrors = Partial<Record<Field, string>>;

const recurringFormSchema = z.object({
  kind: z.enum(RULE_KINDS, { error: "Choose expense, income or transfer." }),
  amount: z.string().transform((text, context) => {
    const result = parseAmount(text);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.minor;
  }),
  currency: z.enum(CURRENCIES, { error: "Choose GHS or USD." }),
  accountId: z.uuid({ error: "Choose an account." }),
  frequency: z.enum(FREQUENCIES, { error: "Choose weekly or monthly." }),
  startsOn: z.string().refine(isIsoDate, "Enter a real date."),
  endsOn: z.string().refine((text) => text === "" || isIsoDate(text), "Enter a real date, or leave it empty."),
  note: z.string().trim().max(200, "Use 200 characters or fewer."),
});

const isUuid = (text: string) => z.uuid().safeParse(text).success;
const inRange = (text: string, low: number, high: number) =>
  /^\d{1,2}$/.test(text) && Number(text) >= low && Number(text) <= high;

// One rule set for the recurring form: the browser and the Server Action
// both run it, and the database checks again. Fields that depend on the
// kind or the frequency are checked once those are valid.
export function parseRecurringForm(
  raw: Record<string, unknown>,
): { ok: true; value: RecurringInput } | { ok: false; errors: RecurringFormErrors } {
  const text = Object.fromEntries(
    RECURRING_FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""]),
  ) as Record<Field, string>;
  const result = recurringFormSchema.safeParse(text);
  if (!result.success) {
    const errors: RecurringFormErrors = {};
    for (const issue of result.error.issues) {
      errors[issue.path[0] as Field] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const base = result.data;
  const transfer = base.kind === "transfer";
  const weekly = base.frequency === "weekly";
  const errors: RecurringFormErrors = {};
  if (!transfer && !isUuid(text.categoryId)) errors.categoryId = "Choose a category.";
  if (transfer && !isUuid(text.toAccountId)) errors.toAccountId = "Choose the account the money goes to.";
  else if (transfer && text.toAccountId === base.accountId) {
    errors.toAccountId = "Choose a different account to move the money to.";
  }
  if (weekly && !inRange(text.weekday, 1, 7)) errors.weekday = "Choose a day of the week.";
  if (!weekly && !inRange(text.dayOfMonth, 1, 31)) errors.dayOfMonth = "Choose a day from 1 to 31.";
  if (base.endsOn !== "" && base.endsOn < base.startsOn) {
    errors.endsOn = "The end date cannot be before the start date.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      kind: base.kind,
      amountMinor: base.amount,
      currency: base.currency,
      categoryId: transfer ? null : text.categoryId,
      accountId: base.accountId,
      toAccountId: transfer ? text.toAccountId : null,
      frequency: base.frequency,
      weekday: weekly ? Number(text.weekday) : null,
      dayOfMonth: weekly ? null : Number(text.dayOfMonth),
      startsOn: base.startsOn,
      endsOn: base.endsOn === "" ? null : base.endsOn,
      note: base.note,
    },
  };
}

// A database refusal on save, turned into a message for the right field.
// null: not about the form (for example no connection).
export function recurringSaveError(code: string | undefined, message: string): RecurringFormErrors | null {
  if (message.includes("account not found") || message.includes("_account_id_fkey")) {
    return { accountId: "Choose your accounts from the list." };
  }
  if (message.includes("category not found") || message.includes("category_id_fkey")) {
    return { categoryId: "Choose a category from the list." };
  }
  if (code === "23514" && message.includes("category kind must match")) {
    return { categoryId: "Choose a category of the same type (expense or income)." };
  }
  if (code === "23514" && message.includes("in one currency")) {
    return { toAccountId: "A recurring transfer needs two accounts in the same currency." };
  }
  return null;
}
