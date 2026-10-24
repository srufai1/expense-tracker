import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser } from "./test-db";

// Transfers and their fees (DESIGN §6.3, D-06, D-07, D-33), as the database
// enforces them.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

afterAll(async () => {
  await db.close();
});

async function rows<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await asUser(db, userId, () => db.query<T>(sql, params))).rows;
}

async function addAccount(userId: string, name: string, currency = "GHS", opening = 0) {
  const [row] = await rows<{ id: string }>(
    userId,
    `insert into public.accounts (name, type, currency, opening_balance_minor, opening_balance_on)
     values ($1, 'cash', $2, $3, '2026-10-01') returning id`,
    [name, currency, opening],
  );
  return row.id;
}

type Transfer = {
  id?: string | null;
  from: string;
  to: string;
  amount: number;
  received?: number;
  currency?: string;
  rate?: string;
  source?: string;
  rateDate?: string | null;
  ghs?: number;
  fee?: number | null;
  feeGhs?: number | null;
  note?: string;
  on?: string;
};

async function saveTransfer(userId: string, t: Transfer): Promise<string> {
  const currency = t.currency ?? "GHS";
  const [row] = await rows<{ id: string }>(
    userId,
    "select public.save_transfer($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) as id",
    [
      t.id ?? null,
      t.on ?? "2026-10-20",
      t.from,
      t.to,
      t.amount,
      t.received ?? t.amount,
      currency,
      t.rate ?? "1",
      t.source ?? (currency === "GHS" ? "none" : "manual"),
      t.rateDate ?? null,
      t.ghs ?? t.amount,
      t.fee ?? null,
      t.feeGhs ?? t.fee ?? null,
      t.note ?? "",
    ],
  );
  return row.id;
}

async function balance(userId: string, accountId: string) {
  const [row] = await rows<{ balance_minor: number }>(
    userId,
    "select balance_minor from public.account_balances where account_id = $1",
    [accountId],
  );
  return Number(row.balance_minor);
}

const feesOf = (userId: string, transferId: string) =>
  rows<{ amount_minor: number; note: string; system_key: string; kind: string }>(
    userId,
    `select t.amount_minor, t.note, c.system_key, t.kind from public.transactions t
     join public.categories c on c.id = t.category_id where t.parent_transaction_id = $1`,
    [transferId],
  );

describe("save_transfer", () => {
  it("moves money between two accounts: neither income nor spending (D-06)", async () => {
    const momo = await addAccount(ALICE, "Alice MoMo", "GHS", 100_000);
    const bank = await addAccount(ALICE, "Alice bank", "GHS", 0);
    await saveTransfer(ALICE, { from: momo, to: bank, amount: 30_000 });
    expect(await balance(ALICE, momo)).toBe(70_000);
    expect(await balance(ALICE, bank)).toBe(30_000);
  });

  it("saves the fee as a Fees & Charges expense from the same account (D-07)", async () => {
    const momo = await addAccount(ALICE, "Alice MoMo 2", "GHS", 100_000);
    const bank = await addAccount(ALICE, "Alice bank 2", "GHS", 0);
    const id = await saveTransfer(ALICE, { from: momo, to: bank, amount: 30_000, fee: 350 });

    expect(await feesOf(ALICE, id)).toEqual([
      { amount_minor: 350, note: "Transfer fee", system_key: "fees", kind: "expense" },
    ]);
    expect(await balance(ALICE, momo)).toBe(100_000 - 30_000 - 350);
    expect(await balance(ALICE, bank)).toBe(30_000);
  });

  it("records the amount sent and the amount received between currencies (D-33)", async () => {
    const usdCash = await addAccount(ALICE, "Alice USD cash", "USD", 50_000);
    const ghsBank = await addAccount(ALICE, "Alice GHS bank", "GHS", 0);
    // USD 100.00 sent, GHS 1,150.00 received; GHS value at the stored 11.67.
    await saveTransfer(ALICE, {
      from: usdCash,
      to: ghsBank,
      amount: 10_000,
      received: 115_000,
      currency: "USD",
      rate: "11.67",
      source: "auto",
      rateDate: "2026-10-20",
      ghs: 116_700,
    });
    expect(await balance(ALICE, usdCash)).toBe(40_000);
    expect(await balance(ALICE, ghsBank)).toBe(115_000);
  });

  it("changes a transfer and replaces its fee; a fee of 0 removes it", async () => {
    const a = await addAccount(ALICE, "Alice A", "GHS", 10_000);
    const b = await addAccount(ALICE, "Alice B", "GHS", 0);
    const id = await saveTransfer(ALICE, { from: a, to: b, amount: 1_000, fee: 100 });

    expect(await saveTransfer(ALICE, { id, from: a, to: b, amount: 2_000, fee: 150 })).toBe(id);
    expect((await feesOf(ALICE, id)).map((fee) => fee.amount_minor)).toEqual([150]);
    expect(await balance(ALICE, a)).toBe(10_000 - 2_000 - 150);

    await saveTransfer(ALICE, { id, from: a, to: b, amount: 2_000, fee: 0 });
    expect(await feesOf(ALICE, id)).toEqual([]);
    expect(await balance(ALICE, a)).toBe(8_000);
  });

  it("deletes the fee with its transfer, and Undo puts both back with the same id (D-26)", async () => {
    const a = await addAccount(ALICE, "Alice undo A", "GHS", 10_000);
    const b = await addAccount(ALICE, "Alice undo B", "GHS", 0);
    const id = await saveTransfer(ALICE, { from: a, to: b, amount: 1_000, fee: 100 });

    await rows(ALICE, "delete from public.transactions where id = $1", [id]);
    expect(await rows(ALICE, "select id from public.transactions where id = $1 or parent_transaction_id = $1", [id])).toEqual([]);
    expect(await balance(ALICE, a)).toBe(10_000);

    expect(await saveTransfer(ALICE, { id, from: a, to: b, amount: 1_000, fee: 100 })).toBe(id);
    expect(await balance(ALICE, a)).toBe(8_900);
  });

  it("saves nothing when any part fails: the transfer never exists without its fee", async () => {
    const a = await addAccount(ALICE, "Alice atomic A", "GHS", 10_000);
    const b = await addAccount(ALICE, "Alice atomic B", "GHS", 0);
    // A fee whose GHS value does not match fails its CHECK after the transfer row was written.
    await expect(saveTransfer(ALICE, { from: a, to: b, amount: 1_000, fee: 100, feeGhs: 99 })).rejects.toThrow(
      /transactions_amount_ghs/,
    );
    expect(await rows(ALICE, "select id from public.transactions where account_id = $1", [a])).toEqual([]);
  });

  it("refuses a change to something that is not a transfer", async () => {
    const a = await addAccount(ALICE, "Alice not A", "GHS", 0);
    const b = await addAccount(ALICE, "Alice not B", "GHS", 0);
    const [category] = await rows<{ id: string }>(
      ALICE,
      "insert into public.categories (kind, name) values ('expense', 'Not a transfer') returning id",
    );
    const [expense] = await rows<{ id: string }>(
      ALICE,
      `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency,
         amount_ghs_minor, account_amount_minor) values ('expense', '2026-10-20', $1, $2, 100, 'GHS', 100, 100)
       returning id`,
      [a, category.id],
    );
    await expect(saveTransfer(ALICE, { id: expense.id, from: a, to: b, amount: 100 })).rejects.toThrow(
      /not a transfer/,
    );
  });
});

describe("transfer rules", () => {
  it("needs two different accounts of the user's own", async () => {
    const a = await addAccount(ALICE, "Alice rule A", "GHS", 0);
    const bobs = await addAccount(BOB, "Bob wallet", "GHS", 0);
    await expect(saveTransfer(ALICE, { from: a, to: a, amount: 100 })).rejects.toThrow(
      /transactions_transfer_two_accounts/,
    );
    await expect(saveTransfer(ALICE, { from: a, to: bobs, amount: 100 })).rejects.toThrow(/account not found/);
  });

  it("is in the sending account's currency", async () => {
    const ghs = await addAccount(ALICE, "Alice rule GHS", "GHS", 0);
    const usd = await addAccount(ALICE, "Alice rule USD", "USD", 0);
    await expect(
      saveTransfer(ALICE, { from: ghs, to: usd, amount: 1_000, received: 85, currency: "USD", rate: "11", ghs: 11_000 }),
    ).rejects.toThrow(/currency of the account it leaves/);
  });

  it("receives exactly the amount sent when both accounts use one currency", async () => {
    const a = await addAccount(ALICE, "Alice same A", "GHS", 0);
    const b = await addAccount(ALICE, "Alice same B", "GHS", 0);
    await expect(saveTransfer(ALICE, { from: a, to: b, amount: 1_000, received: 990 })).rejects.toThrow(
      /receives the amount sent/,
    );
  });

  it("keeps a fee tied to the user's own transfer, as a Fees & Charges expense", async () => {
    const a = await addAccount(ALICE, "Alice fee A", "GHS", 0);
    const b = await addAccount(ALICE, "Alice fee B", "GHS", 0);
    const transferId = await saveTransfer(ALICE, { from: a, to: b, amount: 1_000, fee: 50 });
    const [food] = await rows<{ id: string }>(
      ALICE,
      "insert into public.categories (kind, name) values ('expense', 'Fee food') returning id",
    );
    const insertFee = (userId: string, accountId: string, categoryId: string) =>
      rows(
        userId,
        `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency,
           amount_ghs_minor, account_amount_minor, parent_transaction_id)
         values ('expense', '2026-10-20', $1, $2, 10, 'GHS', 10, 10, $3)`,
        [accountId, categoryId, transferId],
      );

    // Not in Fees & Charges, or not from the transfer's account.
    await expect(insertFee(ALICE, a, food.id)).rejects.toThrow(/a fee is a Fees & Charges expense/);
    const [fees] = await rows<{ id: string }>(ALICE, "select id from public.categories where system_key = 'fees'");
    await expect(insertFee(ALICE, b, fees.id)).rejects.toThrow(/a fee is a Fees & Charges expense/);
    await expect(insertFee(ALICE, a, fees.id)).resolves.toBeDefined();

    // Bob cannot hang his rows on Alice's transfer.
    const bobAccount = await addAccount(BOB, "Bob fee", "GHS", 0);
    await rows(BOB, "select public.seed_starter_categories()");
    const [bobFees] = await rows<{ id: string }>(BOB, "select id from public.categories where system_key = 'fees'");
    await expect(insertFee(BOB, bobAccount, bobFees.id)).rejects.toThrow(/transfer not found/);
  });

  it("creates Fees & Charges on first use if the starter list was never made", async () => {
    const carol = "00000000-0000-4000-8000-00000000000c";
    await createUser(db, carol);
    const a = await addAccount(carol, "Carol A", "GHS", 1_000);
    const b = await addAccount(carol, "Carol B", "GHS", 0);
    const id = await saveTransfer(carol, { from: a, to: b, amount: 100, fee: 5 });
    expect((await feesOf(carol, id)).map((fee) => fee.system_key)).toEqual(["fees"]);
  });
});

describe("delete_transfer (Codex review on PR #7)", () => {
  // Reading the fee and deleting the transfer must be one step, so Undo
  // gets back exactly what was deleted (D-26), even if another tab saves
  // the same transfer at the same time.
  it("deletes a transfer with its fee and returns them in save_transfer's shape", async () => {
    const usd = await addAccount(ALICE, "Alice del USD", "USD", 50_000);
    const ghs = await addAccount(ALICE, "Alice del GHS", "GHS", 0);
    const id = await saveTransfer(ALICE, {
      from: usd,
      to: ghs,
      amount: 10_000,
      received: 115_000,
      currency: "USD",
      rate: "11.65",
      source: "auto",
      rateDate: "2026-10-19",
      ghs: 116_500,
      fee: 150,
      feeGhs: 1_748,
      note: "To savings",
    });

    const [{ snapshot }] = await rows<{ snapshot: Record<string, unknown> }>(
      ALICE,
      "select public.delete_transfer($1) as snapshot",
      [id],
    );
    expect(snapshot).toEqual({
      p_id: id,
      p_occurred_on: "2026-10-20",
      p_from_account_id: usd,
      p_to_account_id: ghs,
      p_amount_minor: 10_000,
      p_to_amount_minor: 115_000,
      p_currency: "USD",
      p_fx_rate: 11.65,
      p_fx_source: "auto",
      p_fx_rate_date: "2026-10-19",
      p_amount_ghs_minor: 116_500,
      p_fee_minor: 150,
      p_fee_ghs_minor: 1_748,
      p_note: "To savings",
    });
    expect(await rows(ALICE, "select id from public.transactions where id = $1 or parent_transaction_id = $1", [id])).toEqual([]);
    expect(await balance(ALICE, usd)).toBe(50_000);

    // Undo: the snapshot goes straight back into save_transfer.
    const s = snapshot as Record<string, unknown>;
    await rows(ALICE, "select public.save_transfer($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)", [
      s.p_id, s.p_occurred_on, s.p_from_account_id, s.p_to_account_id, s.p_amount_minor, s.p_to_amount_minor,
      s.p_currency, s.p_fx_rate, s.p_fx_source, s.p_fx_rate_date, s.p_amount_ghs_minor, s.p_fee_minor,
      s.p_fee_ghs_minor, s.p_note,
    ]);
    expect(await balance(ALICE, usd)).toBe(50_000 - 10_000 - 150);
    expect((await feesOf(ALICE, id)).map((fee) => fee.amount_minor)).toEqual([150]);
  });

  it("returns a null fee for a transfer without one", async () => {
    const a = await addAccount(ALICE, "Alice del A", "GHS", 0);
    const b = await addAccount(ALICE, "Alice del B", "GHS", 0);
    const id = await saveTransfer(ALICE, { from: a, to: b, amount: 100 });
    const [{ snapshot }] = await rows<{ snapshot: Record<string, unknown> }>(
      ALICE,
      "select public.delete_transfer($1) as snapshot",
      [id],
    );
    expect(snapshot).toMatchObject({ p_id: id, p_fee_minor: null, p_fee_ghs_minor: null });
  });

  it("returns null, deleting nothing, for anything that is not the user's own transfer", async () => {
    const a = await addAccount(ALICE, "Alice keep A", "GHS", 0);
    const b = await addAccount(ALICE, "Alice keep B", "GHS", 0);
    const id = await saveTransfer(ALICE, { from: a, to: b, amount: 100, fee: 5 });
    const [fee] = await rows<{ id: string }>(ALICE, "select id from public.transactions where parent_transaction_id = $1", [id]);

    const run = async (userId: string, target: string) =>
      (await rows<{ snapshot: unknown }>(userId, "select public.delete_transfer($1) as snapshot", [target]))[0].snapshot;
    expect(await run(BOB, id)).toBeNull();
    expect(await run(ALICE, fee.id)).toBeNull();
    expect(await rows(ALICE, "select id from public.transactions where id = $1 or parent_transaction_id = $1", [id])).toHaveLength(2);
  });
});
