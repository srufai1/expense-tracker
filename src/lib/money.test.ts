import { describe, expect, it } from "vitest";

import {
  divideRounded,
  convertFromGhs,
  convertToGhs,
  formatAmountForInput,
  formatMoney,
  isValidRate,
  MAX_AMOUNT_MINOR,
  parseAmount,
} from "./money";

// Amounts are whole numbers in the smallest unit: GHS 12.50 is 1250 (M-1).

describe("parseAmount", () => {
  const ok = (minor: number) => ({ ok: true, minor });

  it("reads whole and decimal amounts", () => {
    expect(parseAmount("12")).toEqual(ok(1200));
    expect(parseAmount("12.5")).toEqual(ok(1250));
    expect(parseAmount("12.50")).toEqual(ok(1250));
    expect(parseAmount("0.07")).toEqual(ok(7));
    expect(parseAmount(".5")).toEqual(ok(50));
    expect(parseAmount("12.")).toEqual(ok(1200));
  });

  it("accepts thousands separators and spaces around the number", () => {
    expect(parseAmount("1,234.56")).toEqual(ok(123456));
    expect(parseAmount("1,234,567")).toEqual(ok(123456700));
    expect(parseAmount("  12  ")).toEqual(ok(1200));
  });

  it("never rounds what the user typed", () => {
    expect(parseAmount("12.345")).toEqual({ ok: false, error: "Use at most 2 decimal places." });
  });

  it("rejects text that is not an amount", () => {
    const error = "Enter an amount, for example 12.50.";
    expect(parseAmount("")).toEqual({ ok: false, error });
    expect(parseAmount("   ")).toEqual({ ok: false, error });
    expect(parseAmount("abc")).toEqual({ ok: false, error });
    expect(parseAmount("1.2.3")).toEqual({ ok: false, error });
    expect(parseAmount("1,23")).toEqual({ ok: false, error });
    expect(parseAmount("12,34.50")).toEqual({ ok: false, error });
    expect(parseAmount("1e5")).toEqual({ ok: false, error });
    expect(parseAmount(".")).toEqual({ ok: false, error });
  });

  it("rejects zero unless it is allowed", () => {
    const error = "The amount must be more than 0.";
    expect(parseAmount("0")).toEqual({ ok: false, error });
    expect(parseAmount("0.00")).toEqual({ ok: false, error });
    expect(parseAmount("0", { allowZero: true })).toEqual(ok(0));
  });

  it("rejects negative amounts unless they are allowed (D-29)", () => {
    expect(parseAmount("-5")).toEqual({ ok: false, error: "The amount cannot be negative." });
    expect(parseAmount("-5", { allowNegative: true })).toEqual(ok(-500));
    // The typographic minus sign that phones sometimes insert.
    expect(parseAmount("−5.25", { allowNegative: true })).toEqual(ok(-525));
  });

  it("turns minus zero into plain zero", () => {
    const result = parseAmount("-0", { allowNegative: true, allowZero: true });
    expect(result).toEqual(ok(0));
    expect(result.ok && Object.is(result.minor, -0)).toBe(false);
  });

  it("rejects amounts above the limit", () => {
    expect(parseAmount("999,999,999.99")).toEqual(ok(MAX_AMOUNT_MINOR));
    expect(parseAmount("1,000,000,000")).toEqual({ ok: false, error: "The amount is too large." });
    expect(parseAmount("-1000000000", { allowNegative: true })).toEqual({
      ok: false,
      error: "The amount is too large.",
    });
  });
});

describe("formatMoney", () => {
  it("shows the currency, thousands separators and two decimals (M-9)", () => {
    expect(formatMoney(123456, "GHS")).toBe("GHS 1,234.56");
    expect(formatMoney(7, "GHS")).toBe("GHS 0.07");
    expect(formatMoney(0, "USD")).toBe("USD 0.00");
    expect(formatMoney(999, "USD")).toBe("USD 9.99");
    expect(formatMoney(MAX_AMOUNT_MINOR, "GHS")).toBe("GHS 999,999,999.99");
  });

  it("puts a minus sign before negative amounts", () => {
    expect(formatMoney(-98600, "GHS")).toBe("−GHS 986.00");
    expect(formatMoney(-5, "USD")).toBe("−USD 0.05");
  });

  it("refuses amounts that are not whole minor units (a programming error)", () => {
    expect(() => formatMoney(12.5, "GHS")).toThrow();
    expect(() => formatMoney(Number.NaN, "GHS")).toThrow();
  });
});

describe("formatAmountForInput", () => {
  it("writes an amount the way a person types it, so it reads back the same", () => {
    expect(formatAmountForInput(895040)).toBe("8950.40");
    expect(formatAmountForInput(7)).toBe("0.07");
    expect(formatAmountForInput(0)).toBe("0.00");
    expect(formatAmountForInput(-150000)).toBe("-1500.00");
  });

  it("round-trips through parseAmount", () => {
    for (const minor of [0, 7, 895040, -150000, MAX_AMOUNT_MINOR]) {
      expect(parseAmount(formatAmountForInput(minor), { allowNegative: true, allowZero: true })).toEqual({
        ok: true,
        minor,
      });
    }
  });
});

describe("convertToGhs (M-4: the one rounding rule)", () => {
  it("multiplies by the rate and rounds to the nearest pesewa", () => {
    // Netflix: USD 9.99 at 15.40 = 153.846 → GHS 153.85
    expect(convertToGhs(999, "15.40")).toBe(15385);
    expect(convertToGhs(100, "15.4")).toBe(1540);
    expect(convertToGhs(12000, "15.40")).toBe(184800);
  });

  it("rounds half away from zero", () => {
    expect(convertToGhs(1, "0.5")).toBe(1);
    expect(convertToGhs(-1, "0.5")).toBe(-1);
    expect(convertToGhs(1, "0.499999")).toBe(0);
    expect(convertToGhs(3, "0.166667")).toBe(1);
  });

  it("works for negative amounts the same way", () => {
    expect(convertToGhs(-999, "15.40")).toBe(-15385);
  });

  it("accepts the rate as a number too", () => {
    expect(convertToGhs(999, 15.4)).toBe(15385);
  });

  it("is exact where floating-point maths is not", () => {
    // 0.1 + 0.2 style trap: 1.005 × 100 in floats is 100.49999…
    expect(convertToGhs(100, "1.005")).toBe(101); // 100.5 → 101
  });

  it("refuses bad input (programming errors)", () => {
    expect(() => convertToGhs(999, "0")).toThrow();
    expect(() => convertToGhs(999, "-1")).toThrow();
    expect(() => convertToGhs(999, "abc")).toThrow();
    expect(() => convertToGhs(999, "1.1234567")).toThrow();
    expect(() => convertToGhs(9.5, "15.40")).toThrow();
  });

  it("refuses a result too large to store exactly", () => {
    expect(() => convertToGhs(Number.MAX_SAFE_INTEGER, "2")).toThrow();
  });
});

describe("convertFromGhs (D-36: GHS paid from a USD account)", () => {
  it("divides by the rate and rounds to the nearest cent", () => {
    // GHS 100.00 at 11.671489 = USD 8.567977… → USD 8.57
    expect(convertFromGhs(10000, "11.671489")).toBe(857);
    // GHS 154.00 at 15.40 = USD 10.00 exactly
    expect(convertFromGhs(15400, "15.40")).toBe(1000);
  });

  it("rounds half away from zero, like convertToGhs (M-4)", () => {
    // GHS 0.05 at 10 = USD 0.005 → 0.01
    expect(convertFromGhs(5, "10")).toBe(1);
    expect(convertFromGhs(-5, "10")).toBe(-1);
    // GHS 0.04 at 10 = USD 0.004 → 0.00
    expect(convertFromGhs(4, "10")).toBe(0);
  });

  it("refuses bad input (programming errors)", () => {
    expect(() => convertFromGhs(100, "0")).toThrow();
    expect(() => convertFromGhs(100, "abc")).toThrow();
    expect(() => convertFromGhs(1.5, "10")).toThrow();
  });
});

describe("isValidRate", () => {
  it("accepts a positive rate with at most 6 decimals", () => {
    expect(isValidRate("11.671489")).toBe(true);
    expect(isValidRate("15")).toBe(true);
    expect(isValidRate(11.67)).toBe(true);
  });

  it("refuses zero, negative, too many decimals and text", () => {
    expect(isValidRate("0")).toBe(false);
    expect(isValidRate("0.000000")).toBe(false);
    expect(isValidRate("-1")).toBe(false);
    expect(isValidRate("1.1234567")).toBe(false);
    expect(isValidRate("abc")).toBe(false);
    expect(isValidRate("")).toBe(false);
  });

  it("refuses a rate too large for the database column (numeric 14,6)", () => {
    expect(isValidRate("99999999.999999")).toBe(true);
    expect(isValidRate("100000000")).toBe(false);
  });
});

describe("divideRounded (M-4, for averages and percentages)", () => {
  it("rounds to the nearest whole number, half away from zero", () => {
    expect(divideRounded(10, 4)).toBe(3); // 2.5 → 3
    expect(divideRounded(9, 4)).toBe(2); // 2.25 → 2
    expect(divideRounded(-10, 4)).toBe(-3); // -2.5 → -3
    expect(divideRounded(62_800, 4)).toBe(15_700); // a 4-week average of GHS 628.00
    expect(divideRounded(0, 7)).toBe(0);
  });

  it("refuses a denominator of 0 or below, and numbers that are not whole", () => {
    expect(() => divideRounded(1, 0)).toThrow(/denominator/);
    expect(() => divideRounded(1.5, 2)).toThrow(/whole/);
  });
});
