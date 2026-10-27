import { describe, expect, it } from "vitest";
import { accountHistory, transactionAccountChange, type AccountMovement } from "./account-history";

const move = (id: string, amountMinor: number, date = "2026-10-27", school = false): AccountMovement => ({ id, amountMinor, date, school, label: id, href: "/school" });

describe("account balance history", () => {
  it("explains the reported Cash amount without treating school money as personal income", () => {
    const result = accountHistory(0, "2026-10-26", [move("previous", -4700, "2026-10-26"), move("income", 180000), move("to MoMo", -100000), move("income 2", 70000), move("school", 47700, "2026-10-27", true)]);
    expect(result.balanceMinor).toBe(193000);
    expect(result.schoolHeldMinor).toBe(47700);
    expect(result.personalMinor).toBe(145300);
    expect(result.days[0].balanceMinor).toBe(193000);
  });

  it("includes opening balance once and shows older entries without counting them again", () => {
    const result = accountHistory(10000, "2026-10-27", [move("old", 80000, "2026-10-26"), move("new", -2500)]);
    expect(result.balanceMinor).toBe(7500);
    expect(result.beforeOpening.map(m => m.id)).toEqual(["old"]);
    expect(result.days).toHaveLength(1);
  });

  it("counts incoming transfers and fees in account currency, preserving pesewas", () => {
    const result = accountHistory(6443, "2026-10-27", [move("cash deposit", 100000), move("to bank", -80000), move("fee", -600)]);
    expect(result.balanceMinor).toBe(25843);
  });

  it("keeps daily closing balances chronological and school payouts reduce held money", () => {
    const result = accountHistory(0, "2026-10-01", [move("payout", -2000, "2026-10-03", true), move("collection", 5000, "2026-10-02", true), move("expense", -1000, "2026-10-03")]);
    expect(result.days.map(d => [d.date, d.balanceMinor])).toEqual([["2026-10-03", 2000], ["2026-10-02", 5000]]);
    expect(result.personalMinor).toBe(-1000);
    expect(result.schoolHeldMinor).toBe(3000);
  });

  it("handles empty histories and school money collected before the opening date", () => {
    expect(accountHistory(500, "2026-10-27", []).balanceMinor).toBe(500);
    const result = accountHistory(10000, "2026-10-27", [move("school", 3000, "2026-10-26", true)]);
    expect(result.balanceMinor).toBe(10000);
    expect(result.schoolHeldMinor).toBe(3000);
    expect(result.personalMinor).toBe(7000);
  });
});

describe("transfer sides", () => {
  it("uses the received amount for incoming transfers and account amount for outgoing entries", () => {
    const row = { account_id: "usd", kind: "transfer" as const, account_amount_minor: 1000, to_amount_minor: 12000 };
    expect(transactionAccountChange("usd", row)).toBe(-1000);
    expect(transactionAccountChange("ghs", row)).toBe(12000);
    expect(transactionAccountChange("usd", { ...row, kind: "income" })).toBe(1000);
    expect(transactionAccountChange("usd", { ...row, kind: "expense" })).toBe(-1000);
    expect(transactionAccountChange("ghs", { ...row, to_amount_minor: null })).toBe(0);
  });
});
