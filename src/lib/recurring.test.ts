import { describe, expect, it } from "vitest";

import {
  describeSchedule,
  dueDates,
  firstRunOn,
  nextOccurrence,
  occurrenceOnOrAfter,
  parseRecurringForm,
  recurringSaveError,
  type Schedule,
} from "./recurring";

const weekly = (weekday: number): Schedule => ({ frequency: "weekly", weekday, dayOfMonth: null });
const monthly = (dayOfMonth: number): Schedule => ({ frequency: "monthly", weekday: null, dayOfMonth });

describe("occurrenceOnOrAfter", () => {
  it("weekly: the next chosen weekday (1 = Monday … 7 = Sunday), or the date itself", () => {
    // 24 Oct 2026 is a Saturday.
    expect(occurrenceOnOrAfter(weekly(6), "2026-10-24")).toBe("2026-10-24");
    expect(occurrenceOnOrAfter(weekly(1), "2026-10-24")).toBe("2026-10-26");
    expect(occurrenceOnOrAfter(weekly(5), "2026-10-24")).toBe("2026-10-30");
    expect(occurrenceOnOrAfter(weekly(7), "2026-10-24")).toBe("2026-10-25");
  });

  it("monthly: the chosen day this month, or next month", () => {
    expect(occurrenceOnOrAfter(monthly(25), "2026-10-24")).toBe("2026-10-25");
    expect(occurrenceOnOrAfter(monthly(24), "2026-10-24")).toBe("2026-10-24");
    expect(occurrenceOnOrAfter(monthly(1), "2026-10-24")).toBe("2026-11-01");
    expect(occurrenceOnOrAfter(monthly(5), "2026-12-24")).toBe("2027-01-05");
  });

  it("monthly on the 31st (or 29th, 30th) runs on the last day of shorter months (§6.6)", () => {
    expect(occurrenceOnOrAfter(monthly(31), "2027-02-01")).toBe("2027-02-28");
    expect(occurrenceOnOrAfter(monthly(31), "2028-02-01")).toBe("2028-02-29"); // leap year
    expect(occurrenceOnOrAfter(monthly(30), "2027-02-10")).toBe("2027-02-28");
    expect(occurrenceOnOrAfter(monthly(31), "2026-11-01")).toBe("2026-11-30");
    expect(occurrenceOnOrAfter(monthly(31), "2026-12-01")).toBe("2026-12-31");
  });
});

describe("nextOccurrence", () => {
  it("is the first occurrence after the date", () => {
    expect(nextOccurrence(weekly(6), "2026-10-24")).toBe("2026-10-31");
    expect(nextOccurrence(monthly(25), "2026-10-25")).toBe("2026-11-25");
  });

  it("goes back to the 31st after a short month", () => {
    expect(nextOccurrence(monthly(31), "2027-01-31")).toBe("2027-02-28");
    expect(nextOccurrence(monthly(31), "2027-02-28")).toBe("2027-03-31");
  });
});

describe("dueDates", () => {
  const rule = (values: Partial<Parameters<typeof dueDates>[0]> = {}) => ({
    ...monthly(25),
    nextRunOn: "2026-10-25",
    endsOn: null,
    paused: false,
    ...values,
  });

  it("is nothing before the next run date", () => {
    expect(dueDates(rule(), "2026-10-24")).toEqual([]);
  });

  it("is the next run date when it is today", () => {
    expect(dueDates(rule(), "2026-10-25")).toEqual(["2026-10-25"]);
  });

  it("catches up on every missed date when the daily job did not run (§6.6)", () => {
    expect(dueDates(rule({ ...weekly(1), nextRunOn: "2026-10-05" }), "2026-10-24")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
    expect(dueDates(rule({ nextRunOn: "2026-08-25" }), "2026-10-25")).toEqual([
      "2026-08-25",
      "2026-09-25",
      "2026-10-25",
    ]);
  });

  it("stops at the end date", () => {
    expect(dueDates(rule({ nextRunOn: "2026-08-25", endsOn: "2026-09-30" }), "2026-12-01")).toEqual([
      "2026-08-25",
      "2026-09-25",
    ]);
    expect(dueDates(rule({ endsOn: "2026-10-24" }), "2026-12-01")).toEqual([]);
  });

  it("creates nothing while paused", () => {
    expect(dueDates(rule({ paused: true }), "2026-12-01")).toEqual([]);
  });

  it("never runs away: at most 400 dates at once", () => {
    expect(dueDates(rule({ ...weekly(1), nextRunOn: "2000-01-03" }), "2026-10-24")).toHaveLength(400);
  });
});

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "33333333-3333-4333-8333-333333333333";
const GOAL = "44444444-4444-4444-8444-444444444444";

const form = {
  kind: "expense",
  amount: "1,500",
  currency: "GHS",
  categoryId: CATEGORY,
  accountId: ACCOUNT,
  toAccountId: "",
  frequency: "monthly",
  weekday: "",
  dayOfMonth: "25",
  startsOn: "2026-10-25",
  endsOn: "",
  note: " Rent ",
};

describe("parseRecurringForm", () => {
  it("reads an expense or income rule", () => {
    expect(parseRecurringForm(form)).toEqual({
      ok: true,
      value: {
        kind: "expense",
        amountMinor: 150000,
        currency: "GHS",
        categoryId: CATEGORY,
        accountId: ACCOUNT,
        toAccountId: null,
        goalId: null,
        frequency: "monthly",
        weekday: null,
        dayOfMonth: 25,
        startsOn: "2026-10-25",
        endsOn: null,
        note: "Rent",
      },
    });
  });

  it("reads a weekly transfer: no category, no day of the month", () => {
    const result = parseRecurringForm({
      ...form,
      kind: "transfer",
      toAccountId: OTHER,
      categoryId: CATEGORY,
      frequency: "weekly",
      weekday: "5",
      dayOfMonth: "25",
      endsOn: "2027-10-25",
    });
    expect(result.ok && result.value).toMatchObject({
      kind: "transfer",
      categoryId: null,
      toAccountId: OTHER,
      frequency: "weekly",
      weekday: 5,
      dayOfMonth: null,
      endsOn: "2027-10-25",
    });
  });

  it("reads a goal contribution (D-40): GHS, a goal, no account or category", () => {
    const result = parseRecurringForm({
      ...form,
      kind: "goal_contribution",
      goalId: GOAL,
      accountId: "",
      toAccountId: OTHER,
      frequency: "weekly",
      weekday: "1",
    });
    expect(result.ok && result.value).toMatchObject({
      kind: "goal_contribution",
      amountMinor: 150000,
      currency: "GHS",
      goalId: GOAL,
      accountId: null,
      categoryId: null,
      toAccountId: null,
    });
    expect(parseRecurringForm({ ...form, kind: "goal_contribution", goalId: "" })).toEqual({
      ok: false,
      errors: { goalId: "Choose a goal." },
    });
    expect(parseRecurringForm({ ...form, kind: "goal_contribution", goalId: GOAL, currency: "USD" })).toEqual({
      ok: false,
      errors: { currency: "A goal contribution is in GHS." },
    });
  });

  it("gives one message per wrong field", () => {
    expect(
      parseRecurringForm({
        ...form,
        kind: "goal",
        amount: "0",
        currency: "EUR",
        categoryId: "",
        accountId: "",
        frequency: "daily",
        startsOn: "nope",
        endsOn: "2026-02-30",
        note: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      errors: {
        kind: "Choose expense, income, transfer or goal.",
        amount: "The amount must be more than 0.",
        currency: "Choose GHS or USD.",
        accountId: "Choose an account.",
        frequency: "Choose weekly or monthly.",
        startsOn: "Enter a real date.",
        endsOn: "Enter a real date, or leave it empty.",
        note: "Use 200 characters or fewer.",
      },
    });
  });

  it("checks the fields that depend on the kind and the frequency", () => {
    expect(parseRecurringForm({ ...form, categoryId: "" })).toEqual({
      ok: false,
      errors: { categoryId: "Choose a category." },
    });
    expect(parseRecurringForm({ ...form, kind: "transfer", toAccountId: "" })).toEqual({
      ok: false,
      errors: { toAccountId: "Choose the account the money goes to." },
    });
    expect(parseRecurringForm({ ...form, kind: "transfer", toAccountId: ACCOUNT })).toEqual({
      ok: false,
      errors: { toAccountId: "Choose a different account to move the money to." },
    });
    expect(parseRecurringForm({ ...form, frequency: "weekly", weekday: "8" })).toEqual({
      ok: false,
      errors: { weekday: "Choose a day of the week." },
    });
    expect(parseRecurringForm({ ...form, dayOfMonth: "0" })).toEqual({
      ok: false,
      errors: { dayOfMonth: "Choose a day from 1 to 31." },
    });
    expect(parseRecurringForm({ ...form, endsOn: "2026-10-24" })).toEqual({
      ok: false,
      errors: { endsOn: "The end date cannot be before the start date." },
    });
  });
});

describe("firstRunOn (D-39)", () => {
  const schedule = { frequency: "monthly" as const, weekday: null, dayOfMonth: 25 };

  it("starts on the first occurrence from the start date", () => {
    expect(firstRunOn(schedule, "2026-11-01", "2026-10-24")).toBe("2026-11-25");
  });

  it("never starts before today: older dates are not created automatically", () => {
    expect(firstRunOn(schedule, "2026-01-01", "2026-10-24")).toBe("2026-10-25");
    expect(firstRunOn(schedule, "2026-01-01", "2026-10-25")).toBe("2026-10-25");
  });
});

describe("describeSchedule", () => {
  it("says the schedule in words", () => {
    expect(describeSchedule({ frequency: "weekly", weekday: 1, dayOfMonth: null })).toBe("Every Monday");
    expect(describeSchedule({ frequency: "weekly", weekday: 7, dayOfMonth: null })).toBe("Every Sunday");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 1 })).toBe("Monthly on the 1st");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 2 })).toBe("Monthly on the 2nd");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 23 })).toBe("Monthly on the 23rd");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 11 })).toBe("Monthly on the 11th");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 31 })).toBe(
      "Monthly on the 31st (or the last day)",
    );
  });
});

describe("recurringSaveError", () => {
  it("points at the field the database refused", () => {
    expect(recurringSaveError("23503", "recurring_rules: account not found")).toEqual({
      accountId: "Choose your accounts from the list.",
    });
    expect(recurringSaveError("23503", "recurring_rules: category not found")).toEqual({
      categoryId: "Choose a category from the list.",
    });
    expect(recurringSaveError("23514", "recurring_rules: the category kind must match the kind")).toEqual({
      categoryId: "Choose a category of the same type (expense or income).",
    });
    expect(recurringSaveError("23514", "recurring_rules: a recurring transfer is between accounts in one currency")).toEqual({
      toAccountId: "A recurring transfer needs two accounts in the same currency.",
    });
    expect(recurringSaveError("23503", "recurring_rules: goal not found")).toEqual({
      goalId: "Choose a goal from the list.",
    });
  });

  it("returns null for anything else", () => {
    expect(recurringSaveError(undefined, "fetch failed")).toBeNull();
  });
});
