import { describe, expect, it } from "vitest";

import { accountDeleteError, accountSaveError, accountTypeLabel, parseAccountForm, totalsByCurrency } from "./accounts";

const TODAY = "2026-10-23";

const valid = {
  name: "Ecobank Savings",
  type: "bank",
  currency: "GHS",
  openingBalance: "8,950.40",
  openingBalanceOn: "2026-10-23",
};

describe("parseAccountForm", () => {
  it("turns a valid form into an account, amount in pesewas", () => {
    expect(parseAccountForm(valid, TODAY)).toEqual({
      ok: true,
      value: {
        name: "Ecobank Savings",
        type: "bank",
        currency: "GHS",
        openingBalanceMinor: 895040,
        openingBalanceOn: "2026-10-23",
      },
    });
  });

  it("trims spaces around the name", () => {
    const result = parseAccountForm({ ...valid, name: "  Cash  " }, TODAY);
    expect(result.ok && result.value.name).toBe("Cash");
  });

  it("allows a zero or negative opening balance (D-29)", () => {
    const zero = parseAccountForm({ ...valid, openingBalance: "0" }, TODAY);
    const negative = parseAccountForm({ ...valid, openingBalance: "-1,500" }, TODAY);
    expect(zero.ok && zero.value.openingBalanceMinor).toBe(0);
    expect(negative.ok && negative.value.openingBalanceMinor).toBe(-150000);
  });

  it("allows an opening date in the past (D-30)", () => {
    const result = parseAccountForm({ ...valid, openingBalanceOn: "2026-09-01" }, TODAY);
    expect(result.ok && result.value.openingBalanceOn).toBe("2026-09-01");
  });

  it("explains every problem, one message per field", () => {
    const result = parseAccountForm(
      { name: "   ", type: "crypto", currency: "EUR", openingBalance: "12.345", openingBalanceOn: "2026-02-30" },
      TODAY,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Enter a name.",
        type: "Choose an account type.",
        currency: "Choose GHS or USD.",
        openingBalance: "Use at most 2 decimal places.",
        openingBalanceOn: "Enter a real date.",
      },
    });
  });

  it("rejects names longer than 60 characters", () => {
    const result = parseAccountForm({ ...valid, name: "x".repeat(61) }, TODAY);
    expect(result.ok ? null : result.errors.name).toBe("Use 60 characters or fewer.");
  });

  it("rejects an opening date in the future", () => {
    const result = parseAccountForm({ ...valid, openingBalanceOn: "2026-10-24" }, TODAY);
    expect(result.ok ? null : result.errors.openingBalanceOn).toBe("The date cannot be in the future.");
  });

  it("treats missing fields as empty, not as a crash", () => {
    const result = parseAccountForm({}, TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.errors.name).toBe("Enter a name.");
    expect(result.ok ? null : result.errors.openingBalance).toBe("Enter an amount, for example 12.50.");
  });
});

describe("totalsByCurrency", () => {
  it("adds balances per currency and never mixes GHS and USD", () => {
    expect(
      totalsByCurrency([
        { currency: "GHS", balanceMinor: 895040 },
        { currency: "GHS", balanceMinor: -150000 },
        { currency: "USD", balanceMinor: 12000 },
      ]),
    ).toEqual({ GHS: 745040, USD: 12000 });
  });

  it("gives zero for a currency with no accounts", () => {
    expect(totalsByCurrency([])).toEqual({ GHS: 0, USD: 0 });
  });
});

describe("accountTypeLabel", () => {
  it("gives the name shown on screen", () => {
    expect(accountTypeLabel("mobile_money")).toBe("Mobile Money");
    expect(accountTypeLabel("cash")).toBe("Cash");
  });

  it("shows an unknown type as it is instead of crashing", () => {
    expect(accountTypeLabel("savings" as never)).toBe("savings");
  });
});

describe("accountDeleteError", () => {
  const IN_USE =
    "This account has transactions, so it cannot be deleted. Archive it instead: it is hidden, and its history stays.";

  it("says to archive an account that has transactions, on any Postgres version", () => {
    expect(accountDeleteError("23503")).toBe(IN_USE);
    expect(accountDeleteError("23001")).toBe(IN_USE);
  });

  it("asks to check the connection otherwise", () => {
    expect(accountDeleteError(undefined)).toBe("Check your internet connection and try again.");
  });
});

describe("accountSaveError", () => {
  it("points at the field the database refused", () => {
    expect(accountSaveError("23505", "duplicate key value violates unique constraint")).toEqual({
      name: "You already have an account with this name.",
    });
    expect(
      accountSaveError("23514", "accounts: the currency of an account with transactions cannot change"),
    ).toEqual({ currency: "This account has transactions, so its currency cannot change." });
  });

  it("returns null for anything else", () => {
    expect(accountSaveError("23514", "something else")).toBeNull();
    expect(accountSaveError(undefined, "fetch failed")).toBeNull();
  });
});
