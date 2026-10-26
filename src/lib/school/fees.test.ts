import { describe, expect, it } from "vitest";

import { feeTotals, owes, payStatus } from "./fees";

describe("payStatus", () => {
  it("not paid: the whole fee is the balance", () => {
    expect(payStatus(15000, 0)).toEqual({ kind: "unpaid", balanceMinor: 15000 });
  });

  it("paid part: advance and balance, e.g. 100.00 of 150.00", () => {
    expect(payStatus(15000, 10000)).toEqual({ kind: "part", advanceMinor: 10000, balanceMinor: 5000 });
  });

  it("paid in full", () => {
    expect(payStatus(15000, 15000)).toEqual({ kind: "paid" });
  });

  it("paid more than the fee", () => {
    expect(payStatus(15000, 16000)).toEqual({ kind: "over", extraMinor: 1000 });
    expect(payStatus(0, 500)).toEqual({ kind: "over", extraMinor: 500 });
  });

  it("a full discount (0 to pay) is free", () => {
    expect(payStatus(0, 0)).toEqual({ kind: "free" });
  });

  it("only unpaid and part-paid students owe", () => {
    expect(owes(payStatus(15000, 0))).toBe(true);
    expect(owes(payStatus(15000, 5000))).toBe(true);
    expect(owes(payStatus(15000, 15000))).toBe(false);
    expect(owes(payStatus(0, 0))).toBe(false);
  });
});

describe("feeTotals", () => {
  it("adds what came in and what students still owe", () => {
    expect(
      feeTotals([
        { payableMinor: 15000, paidMinor: 15000 },
        { payableMinor: 15000, paidMinor: 10000 },
        { payableMinor: 15000, paidMinor: 0 },
        { payableMinor: 0, paidMinor: 0 },
        { payableMinor: 15000, paidMinor: 16000 },
      ]),
    ).toEqual({ collectedMinor: 41000, stillToPayMinor: 20000, owing: 2, done: 3 });
  });
});
