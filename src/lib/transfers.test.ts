import { describe, expect, it } from "vitest";

import {
  buildTransferArgs,
  impliedRate,
  parseTransferForm,
  parseTransferSnapshot,
  transferSaveError,
  type TransferInput,
} from "./transfers";

const FROM = "11111111-1111-4111-8111-111111111111";
const TO = "22222222-2222-4222-8222-222222222222";

const valid = {
  fromAccountId: FROM,
  toAccountId: TO,
  amount: "300.00",
  received: "",
  fee: "",
  occurredOn: "2026-10-20",
  rate: "",
  note: " Savings ",
};

describe("parseTransferForm", () => {
  it("reads a valid form; empty received and fee mean 'not typed' and 'no fee'", () => {
    expect(parseTransferForm(valid)).toEqual({
      ok: true,
      value: {
        fromAccountId: FROM,
        toAccountId: TO,
        amountMinor: 30000,
        receivedMinor: null,
        feeMinor: null,
        occurredOn: "2026-10-20",
        rate: "",
        note: "Savings",
      },
    });
  });

  it("reads a fee; 0 means no fee", () => {
    expect(parseTransferForm({ ...valid, fee: "3.50" })).toMatchObject({ ok: true, value: { feeMinor: 350 } });
    expect(parseTransferForm({ ...valid, fee: "0" })).toMatchObject({ ok: true, value: { feeMinor: null } });
  });

  it("gives one message per wrong field", () => {
    expect(
      parseTransferForm({
        fromAccountId: "",
        toAccountId: "x",
        amount: "0",
        received: "-1",
        fee: "-2",
        occurredOn: "nope",
        rate: "abc",
        note: "x".repeat(201),
      }),
    ).toEqual({
      ok: false,
      errors: {
        fromAccountId: "Choose the account the money leaves.",
        toAccountId: "Choose the account the money goes to.",
        amount: "The amount must be more than 0.",
        received: "The amount cannot be negative.",
        fee: "The amount cannot be negative.",
        occurredOn: "Enter a real date.",
        rate: "Enter a rate above 0 with at most 6 decimals, e.g. 11.67.",
        note: "Use 200 characters or fewer.",
      },
    });
  });

  it("needs two different accounts", () => {
    expect(parseTransferForm({ ...valid, toAccountId: FROM })).toEqual({
      ok: false,
      errors: { toAccountId: "Choose a different account to move the money to." },
    });
  });
});

describe("buildTransferArgs", () => {
  const input = (values: Partial<TransferInput> = {}): TransferInput => ({
    fromAccountId: FROM,
    toAccountId: TO,
    amountMinor: 30000,
    receivedMinor: null,
    feeMinor: null,
    occurredOn: "2026-10-20",
    rate: "",
    note: "",
    ...values,
  });

  it("GHS to GHS: what arrives is what was sent, rate 1", () => {
    expect(buildTransferArgs(input({ feeMinor: 350 }), "GHS", "GHS", null)).toEqual({
      ok: true,
      args: {
        p_id: null,
        p_occurred_on: "2026-10-20",
        p_from_account_id: FROM,
        p_to_account_id: TO,
        p_amount_minor: 30000,
        p_to_amount_minor: 30000,
        p_currency: "GHS",
        p_fx_rate: "1",
        p_fx_source: "none",
        p_fx_rate_date: null,
        p_amount_ghs_minor: 30000,
        p_fee_minor: 350,
        p_fee_ghs_minor: 350,
        p_note: "",
      },
    });
  });

  it("ignores a typed received amount when both accounts use one currency", () => {
    const result = buildTransferArgs(input({ receivedMinor: 1 }), "GHS", "GHS", null);
    expect(result.ok && result.args.p_to_amount_minor).toBe(30000);
  });

  it("between currencies needs the amount received, as it happened (D-33)", () => {
    expect(buildTransferArgs(input(), "GHS", "USD", null)).toEqual({
      ok: false,
      errors: { received: "Enter the amount that arrived, in USD." },
    });
    const result = buildTransferArgs(input({ receivedMinor: 2570 }), "GHS", "USD", null);
    expect(result.ok && result.args).toMatchObject({ p_currency: "GHS", p_amount_minor: 30000, p_to_amount_minor: 2570 });
  });

  it("from a USD account: the GHS values use the rate, auto when it is the stored one (M-5)", () => {
    const stored = { rateDate: "2026-10-19", rate: "11.65" };
    const result = buildTransferArgs(
      input({ amountMinor: 10000, receivedMinor: 115000, feeMinor: 150, rate: "11.65" }),
      "USD",
      "GHS",
      stored,
    );
    expect(result.ok && result.args).toMatchObject({
      p_currency: "USD",
      p_fx_rate: "11.65",
      p_fx_source: "auto",
      p_fx_rate_date: "2026-10-19",
      p_amount_ghs_minor: 116500,
      p_to_amount_minor: 115000,
      // USD 1.50 fee × 11.65 = GHS 17.475 → 17.48
      p_fee_minor: 150,
      p_fee_ghs_minor: 1748,
    });
    const manual = buildTransferArgs(input({ amountMinor: 10000, receivedMinor: 115000, rate: "11.5" }), "USD", "GHS", stored);
    expect(manual.ok && manual.args).toMatchObject({ p_fx_source: "manual", p_fx_rate_date: null });
  });

  it("from a USD account needs a rate", () => {
    expect(buildTransferArgs(input({ rate: "" }), "USD", "USD", null)).toEqual({
      ok: false,
      errors: { rate: "Enter the exchange rate: how many GHS for 1 USD." },
    });
  });

  it("refuses values too large to convert, instead of throwing", () => {
    expect(buildTransferArgs(input({ amountMinor: 99_999_999_999, rate: "99999999" }), "USD", "USD", null)).toEqual({
      ok: false,
      errors: { amount: "The amount is too large." },
    });
    expect(
      buildTransferArgs(input({ amountMinor: 100, feeMinor: 99_999_999_999, rate: "99999999" }), "USD", "USD", null),
    ).toEqual({ ok: false, errors: { fee: "The fee is too large." } });
  });

  it("keeps the id when saving changes to an existing transfer", () => {
    const result = buildTransferArgs(input(), "GHS", "GHS", null, "33333333-3333-4333-8333-333333333333");
    expect(result.ok && result.args.p_id).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("impliedRate (D-33)", () => {
  it("shows how many GHS one USD bought or cost", () => {
    expect(impliedRate(10000, "USD", 115000, "GHS")).toBe("GHS 11.50 per USD");
    expect(impliedRate(30000, "GHS", 2570, "USD")).toBe("GHS 11.6732 per USD");
  });

  it("shows nothing for one currency, or without both amounts", () => {
    expect(impliedRate(100, "GHS", 100, "GHS")).toBeNull();
    expect(impliedRate(100, "USD", null, "GHS")).toBeNull();
    expect(impliedRate(null, "USD", 100, "GHS")).toBeNull();
  });
});

describe("parseTransferSnapshot", () => {
  const snapshot = {
    p_id: "33333333-3333-4333-8333-333333333333",
    p_occurred_on: "2026-10-20",
    p_from_account_id: FROM,
    p_to_account_id: TO,
    p_amount_minor: 30000,
    p_to_amount_minor: 30000,
    p_currency: "GHS",
    p_fx_rate: 1,
    p_fx_source: "none",
    p_fx_rate_date: null,
    p_amount_ghs_minor: 30000,
    p_fee_minor: 350,
    p_fee_ghs_minor: 350,
    p_note: "",
    recurring_rule_id: null,
    occurrence_date: null,
  };

  it("accepts a deleted transfer with its fee, for Undo (D-26)", () => {
    expect(parseTransferSnapshot(snapshot)).toEqual(snapshot);
    expect(parseTransferSnapshot({ ...snapshot, p_fee_minor: null, p_fee_ghs_minor: null })).not.toBeNull();
    // A transfer created by a recurring item keeps its link (Codex review on PR #8).
    expect(
      parseTransferSnapshot({ ...snapshot, recurring_rule_id: "55555555-5555-4555-8555-555555555555", occurrence_date: "2026-10-25" }),
    ).not.toBeNull();
  });

  it("refuses anything else", () => {
    expect(parseTransferSnapshot(null)).toBeNull();
    expect(parseTransferSnapshot({ ...snapshot, p_id: null })).toBeNull();
    expect(parseTransferSnapshot({ ...snapshot, p_amount_minor: 0 })).toBeNull();
    expect(parseTransferSnapshot({ ...snapshot, p_currency: "EUR" })).toBeNull();
  });
});

describe("transferSaveError", () => {
  it("points at the field the database refused", () => {
    expect(transferSaveError("23503", "transactions: account not found")).toEqual({
      fromAccountId: "Choose both accounts from the list.",
    });
    expect(transferSaveError("23503", 'violates foreign key constraint "transactions_to_account_id_fkey"')).toEqual({
      fromAccountId: "Choose both accounts from the list.",
    });
    expect(transferSaveError("23514", 'violates check constraint "transactions_transfer_two_accounts"')).toEqual({
      toAccountId: "Choose a different account to move the money to.",
    });
    const changed = { fromAccountId: "An account's currency has changed. Choose the accounts again." };
    expect(transferSaveError("23514", "transactions: a transfer is in the currency of the account it leaves")).toEqual(changed);
    expect(transferSaveError("23514", "transactions: a transfer in one currency receives the amount sent")).toEqual(changed);
  });

  it("returns null for anything else", () => {
    expect(transferSaveError(undefined, "fetch failed")).toBeNull();
    expect(transferSaveError("23514", "something else")).toBeNull();
  });
});
