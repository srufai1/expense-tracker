import { describe, expect, it } from "vitest";

import { planRule, type RuleToRun } from "./recurring-run";

const USER = "00000000-0000-4000-8000-00000000000a";
const RULE = "55555555-5555-4555-8555-555555555555";
const CASH = "11111111-1111-4111-8111-111111111111";
const BANK = "22222222-2222-4222-8222-222222222222";
const RENT = "33333333-3333-4333-8333-333333333333";

const rule = (values: Partial<RuleToRun> = {}): RuleToRun => ({
  id: RULE,
  userId: USER,
  kind: "expense",
  accountId: CASH,
  categoryId: RENT,
  toAccountId: null,
  amountMinor: 150000,
  currency: "GHS",
  note: "Rent",
  frequency: "monthly",
  weekday: null,
  dayOfMonth: 25,
  nextRunOn: "2026-09-25",
  endsOn: null,
  paused: false,
  ...values,
});

const RATES = [
  { rateDate: "2026-09-01", rate: "11.5" },
  { rateDate: "2026-10-24", rate: "11.671489" },
];

describe("planRule", () => {
  it("makes one transaction per due date, linked to the rule, and moves next_run_on on", () => {
    const plan = planRule(rule(), "GHS", null, RATES, "2026-10-25");
    expect(plan.rows.map((row) => [row.occurred_on, row.occurrence_date])).toEqual([
      ["2026-09-25", "2026-09-25"],
      ["2026-10-25", "2026-10-25"],
    ]);
    expect(plan.rows[0]).toEqual({
      user_id: USER,
      recurring_rule_id: RULE,
      occurrence_date: "2026-09-25",
      kind: "expense",
      occurred_on: "2026-09-25",
      account_id: CASH,
      category_id: RENT,
      to_account_id: null,
      to_amount_minor: null,
      amount_minor: 150000,
      currency: "GHS",
      fx_rate: "1",
      fx_source: "none",
      fx_rate_date: null,
      amount_ghs_minor: 150000,
      account_amount_minor: 150000,
      note: "Rent",
    });
    expect(plan.nextRunOn).toBe("2026-11-25");
    expect(plan.error).toBeNull();
  });

  it("does nothing before the next run date", () => {
    expect(planRule(rule({ nextRunOn: "2026-11-25" }), "GHS", null, RATES, "2026-10-25")).toEqual({
      rows: [],
      nextRunOn: "2026-11-25",
      error: null,
    });
  });

  it("uses each date's stored rate for a USD item (§6.6, M-5)", () => {
    // Netflix USD 9.99 on a GHS card.
    const plan = planRule(
      rule({ amountMinor: 999, currency: "USD", nextRunOn: "2026-09-25" }),
      "GHS",
      null,
      RATES,
      "2026-10-25",
    );
    expect(plan.rows.map((row) => [row.fx_rate, row.fx_source, row.fx_rate_date, row.amount_ghs_minor])).toEqual([
      ["11.5", "auto", "2026-09-01", 11489],
      ["11.671489", "auto", "2026-10-24", 11660],
    ]);
    // M-7: the card is charged the GHS value.
    expect(plan.rows[1].account_amount_minor).toBe(11660);
  });

  it("stops at the first date without a rate and keeps it due (M-6)", () => {
    const plan = planRule(
      rule({ amountMinor: 999, currency: "USD", nextRunOn: "2026-08-25" }),
      "GHS",
      null,
      RATES,
      "2026-10-25",
    );
    expect(plan.rows).toEqual([]);
    expect(plan.nextRunOn).toBe("2026-08-25");
    expect(plan.error).toBe("No exchange rate is stored for 2026-08-25.");
  });

  it("makes a transfer between two accounts in one currency (D-38)", () => {
    const plan = planRule(
      rule({ kind: "transfer", categoryId: null, toAccountId: BANK, amountMinor: 50000, nextRunOn: "2026-10-25" }),
      "GHS",
      "GHS",
      RATES,
      "2026-10-25",
    );
    expect(plan.rows[0]).toMatchObject({
      kind: "transfer",
      account_id: CASH,
      to_account_id: BANK,
      category_id: null,
      amount_minor: 50000,
      to_amount_minor: 50000,
      amount_ghs_minor: 50000,
      account_amount_minor: 50000,
    });
  });

  it("reports a rule that cannot run any more instead of guessing", () => {
    const differentCurrencies = planRule(
      rule({ kind: "transfer", categoryId: null, toAccountId: BANK, nextRunOn: "2026-10-25" }),
      "GHS",
      "USD",
      RATES,
      "2026-10-25",
    );
    expect(differentCurrencies.rows).toEqual([]);
    expect(differentCurrencies.error).toBe("A recurring transfer needs two accounts in one currency.");
  });

  it("makes a USD transfer between two USD accounts at the stored rate", () => {
    const plan = planRule(
      rule({ kind: "transfer", categoryId: null, toAccountId: BANK, amountMinor: 1000, currency: "USD", nextRunOn: "2026-10-25" }),
      "USD",
      "USD",
      RATES,
      "2026-10-25",
    );
    // USD 10.00 × 11.671489 = GHS 116.71489 → 11671
    expect(plan.rows[0]).toMatchObject({
      currency: "USD",
      fx_rate: "11.671489",
      fx_source: "auto",
      fx_rate_date: "2026-10-24",
      amount_ghs_minor: 11671,
      to_amount_minor: 1000,
    });
  });

  it("reports amounts too large to convert instead of throwing", () => {
    const huge = { amountMinor: 99_999_999_999, currency: "USD" as const, nextRunOn: "2026-10-25" };
    const bigRates = [{ rateDate: "2026-10-01", rate: "99999999" }];
    expect(
      planRule(rule({ ...huge, kind: "transfer", categoryId: null, toAccountId: BANK }), "USD", "USD", bigRates, "2026-10-25")
        .error,
    ).toBe("The amount is too large to convert.");
    expect(planRule(rule(huge), "USD", null, bigRates, "2026-10-25").error).toBe("The amount is too large.");
  });

  it("reports a rule without a category", () => {
    expect(planRule(rule({ categoryId: null, nextRunOn: "2026-10-25" }), "GHS", null, RATES, "2026-10-25").error).toBe(
      "The recurring item has no category.",
    );
  });
});

