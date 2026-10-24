import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

// Runs the real migrations in an in-memory Postgres and checks what the
// database itself enforces for transactions and account balances.

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

const DAY = "2026-10-20";

async function one<T>(userId: string, sql: string, params: unknown[] = []): Promise<T> {
  const result = await asUser(db, userId, () => db.query<T>(sql, params));
  return result.rows[0];
}

async function addAccount(userId: string, name: string, values: { currency?: string; opening?: number; on?: string } = {}) {
  const row = await one<{ id: string }>(
    userId,
    `insert into public.accounts (name, type, currency, opening_balance_minor, opening_balance_on)
     values ($1, 'cash', $2, $3, $4) returning id`,
    [name, values.currency ?? "GHS", values.opening ?? 0, values.on ?? "2026-10-01"],
  );
  return row.id;
}

async function addCategory(userId: string, name: string, kind = "expense") {
  const row = await one<{ id: string }>(
    userId,
    "insert into public.categories (kind, name) values ($1, $2) returning id",
    [kind, name],
  );
  return row.id;
}

type Tx = {
  id?: string;
  kind?: string;
  on?: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  currency?: string;
  rate?: string;
  source?: string;
  ghs?: number;
  accountAmount?: number;
  note?: string;
};

// A GHS transaction unless told otherwise: rate 1, every amount the same.
async function addTx(userId: string, tx: Tx) {
  const currency = tx.currency ?? "GHS";
  return one<{ id: string }>(
    userId,
    `insert into public.transactions (id, kind, occurred_on, account_id, category_id, amount_minor,
       currency, fx_rate, fx_source, amount_ghs_minor, account_amount_minor, note)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      tx.id ?? null,
      tx.kind ?? "expense",
      tx.on ?? DAY,
      tx.accountId,
      tx.categoryId,
      tx.amount,
      currency,
      tx.rate ?? "1",
      tx.source ?? (currency === "GHS" ? "none" : "manual"),
      tx.ghs ?? tx.amount,
      tx.accountAmount ?? tx.amount,
      tx.note ?? "",
    ],
  );
}

async function balance(userId: string, accountId: string) {
  const row = await one<{ balance_minor: number; has_transactions: boolean }>(
    userId,
    "select balance_minor, has_transactions from public.account_balances where account_id = $1",
    [accountId],
  );
  return { balance: Number(row.balance_minor), hasTransactions: row.has_transactions };
}

describe("transactions: ownership (Row-Level Security)", () => {
  it("saves a transaction for the signed-in user and hides it from others", async () => {
    const account = await addAccount(ALICE, "Alice wallet");
    const food = await addCategory(ALICE, "Alice food");
    await addTx(ALICE, { accountId: account, categoryId: food, amount: 2500, note: "Waakye" });

    const bobSees = await asUser(db, BOB, () => db.query("select * from public.transactions"));
    expect(bobSees.rows).toEqual([]);
    const anonSees = await asAnon(db, () => db.query("select * from public.transactions").catch((e: Error) => e));
    expect(anonSees).toBeInstanceOf(Error);
  });

  it("refuses another user's account or category", async () => {
    const aliceAccount = await addAccount(ALICE, "Alice private");
    const aliceFood = await addCategory(ALICE, "Alice private food");
    const bobAccount = await addAccount(BOB, "Bob wallet");
    const bobFood = await addCategory(BOB, "Bob food");

    await expect(addTx(BOB, { accountId: aliceAccount, categoryId: bobFood, amount: 100 })).rejects.toThrow(
      /account not found/,
    );
    await expect(addTx(BOB, { accountId: bobAccount, categoryId: aliceFood, amount: 100 })).rejects.toThrow(
      /category not found/,
    );
  });

  // The transfer columns are opened in build step 6 (transfers.test.ts), and
  // the recurring link in step 7 for Undo, own items only (recurring.test.ts).
  it("does not let the app set the owner or receipt columns", async () => {
    for (const column of ["user_id", "receipt_path"]) {
      await expect(
        one(ALICE, `insert into public.transactions (${column}) values (null)`),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(one(ALICE, "update public.transactions set parent_transaction_id = null")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("transactions: shape", () => {
  let account: string;
  let food: string;
  let salary: string;

  beforeAll(async () => {
    account = await addAccount(ALICE, "Alice shape");
    food = await addCategory(ALICE, "Shape food");
    salary = await addCategory(ALICE, "Shape salary", "income");
  });

  it("needs amounts above zero and within the limit", async () => {
    // amount and account amount are equal here, so either range check may fire first.
    for (const amount of [0, -500, 100_000_000_000]) {
      await expect(addTx(ALICE, { accountId: account, categoryId: food, amount })).rejects.toThrow(
        /transactions_(account_)?amount_range/,
      );
    }
    // The account amount has its own range check.
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, currency: "USD", rate: "15", ghs: 1500, accountAmount: 0 }),
    ).rejects.toThrow(/transactions_account_amount_range/);
  });

  it("needs a category of the same kind", async () => {
    await expect(addTx(ALICE, { accountId: account, categoryId: null, amount: 100 })).rejects.toThrow(
      /transactions_transfer_shape/,
    );
    await expect(addTx(ALICE, { accountId: account, categoryId: salary, amount: 100 })).rejects.toThrow(
      /category kind must match/,
    );
    await expect(
      addTx(ALICE, { kind: "income", accountId: account, categoryId: salary, amount: 100 }),
    ).resolves.toBeDefined();
  });

  it("refuses a transfer until transfers are built (step 6)", async () => {
    await expect(
      addTx(ALICE, { kind: "transfer", accountId: account, categoryId: null, amount: 100 }),
    ).rejects.toThrow(/transactions_transfer_shape/);
  });

  it("keeps GHS at rate 1, with every amount the same (M-3, M-7)", async () => {
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, rate: "2", ghs: 200 }),
    ).rejects.toThrow(/transactions_ghs_rate/);
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, ghs: 101 }),
    ).rejects.toThrow(/transactions_amount_ghs/);
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, accountAmount: 99 }),
    ).rejects.toThrow(/account amount must equal/);
  });

  it("checks the GHS value of a USD amount, rounded half away from zero (M-4)", async () => {
    // USD 9.99 × 15.405 = GHS 153.89595 → 15390 pesewas.
    const usd = { accountId: account, categoryId: food, amount: 999, currency: "USD", rate: "15.405" };
    await expect(addTx(ALICE, { ...usd, ghs: 15389, accountAmount: 15389 })).rejects.toThrow(
      /transactions_amount_ghs/,
    );
    await expect(addTx(ALICE, { ...usd, ghs: 15390, accountAmount: 15390 })).resolves.toBeDefined();
    // A foreign currency needs a real rate source.
    await expect(addTx(ALICE, { ...usd, ghs: 15390, source: "none" })).rejects.toThrow(/transactions_ghs_rate/);
  });

  it("keeps the note short and trimmed", async () => {
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, note: "x".repeat(201) }),
    ).rejects.toThrow(/transactions_note_length/);
    await expect(
      addTx(ALICE, { accountId: account, categoryId: food, amount: 100, note: " lunch" }),
    ).rejects.toThrow(/transactions_note_trimmed/);
  });

  it("can be put back with the same id after a delete (Undo, D-26)", async () => {
    const saved = await addTx(ALICE, { accountId: account, categoryId: food, amount: 700 });
    await one(ALICE, "delete from public.transactions where id = $1", [saved.id]);
    const restored = await addTx(ALICE, { id: saved.id, accountId: account, categoryId: food, amount: 700 });
    expect(restored.id).toBe(saved.id);
  });
});

describe("transactions: what they protect", () => {
  it("stops an account or category with transactions from being deleted", async () => {
    const account = await addAccount(ALICE, "Alice used");
    const food = await addCategory(ALICE, "Used food");
    await addTx(ALICE, { accountId: account, categoryId: food, amount: 100 });

    // Postgres 18 reports ON DELETE RESTRICT as 23001 (older versions: 23503).
    // The app treats both the same (src/lib/db-errors.ts).
    await expect(one(ALICE, "delete from public.accounts where id = $1", [account])).rejects.toMatchObject({
      code: "23001",
      message: expect.stringMatching(/foreign key constraint "transactions_account_id_fkey"/),
    });
    await expect(one(ALICE, "delete from public.categories where id = $1", [food])).rejects.toMatchObject({
      code: "23001",
      message: expect.stringMatching(/foreign key constraint "transactions_category_id_fkey"/),
    });
  });

  it("locks an account's currency once it has transactions", async () => {
    const empty = await addAccount(ALICE, "Alice empty");
    await expect(
      one(ALICE, "update public.accounts set currency = 'USD' where id = $1 returning id", [empty]),
    ).resolves.toBeDefined();

    const used = await addAccount(ALICE, "Alice locked");
    const food = await addCategory(ALICE, "Locked food");
    await addTx(ALICE, { accountId: used, categoryId: food, amount: 100 });
    await expect(
      one(ALICE, "update public.accounts set currency = 'USD' where id = $1", [used]),
    ).rejects.toThrow(/cannot change/);
    // Other changes are still allowed.
    await expect(
      one(ALICE, "update public.accounts set name = 'Alice renamed' where id = $1 returning id", [used]),
    ).resolves.toBeDefined();
  });
});

describe("account_balances (M-8, D-30)", () => {
  it("is the opening balance plus income minus expenses", async () => {
    const account = await addAccount(ALICE, "Alice balance", { opening: 50_000, on: "2026-10-01" });
    const food = await addCategory(ALICE, "Balance food");
    const salary = await addCategory(ALICE, "Balance salary", "income");
    expect(await balance(ALICE, account)).toEqual({ balance: 50_000, hasTransactions: false });

    await addTx(ALICE, { accountId: account, categoryId: food, amount: 12_550 });
    await addTx(ALICE, { kind: "income", accountId: account, categoryId: salary, amount: 300_000 });
    await addTx(ALICE, { accountId: account, categoryId: food, amount: 1 });
    expect(await balance(ALICE, account)).toEqual({ balance: 50_000 - 12_550 + 300_000 - 1, hasTransactions: true });
  });

  it("counts transactions on the opening date but not before it", async () => {
    const account = await addAccount(ALICE, "Alice dated", { opening: 10_000, on: "2026-10-10" });
    const food = await addCategory(ALICE, "Dated food");
    await addTx(ALICE, { accountId: account, categoryId: food, amount: 2_000, on: "2026-10-09" });
    expect(await balance(ALICE, account)).toEqual({ balance: 10_000, hasTransactions: true });

    await addTx(ALICE, { accountId: account, categoryId: food, amount: 3_000, on: "2026-10-10" });
    expect(await balance(ALICE, account)).toEqual({ balance: 7_000, hasTransactions: true });
  });

  it("may go below zero (D-29) and uses the account amount (M-7)", async () => {
    const account = await addAccount(ALICE, "Alice card", { opening: 1_000 });
    const subs = await addCategory(ALICE, "Subscriptions");
    // USD 9.99 at 15.40 is GHS 153.85; the card was really charged GHS 155.00.
    await addTx(ALICE, {
      accountId: account,
      categoryId: subs,
      amount: 999,
      currency: "USD",
      rate: "15.40",
      ghs: 15385,
      accountAmount: 15500,
    });
    expect((await balance(ALICE, account)).balance).toBe(1_000 - 15_500);
  });

  it("only shows the user's own balances", async () => {
    const rows = await asUser(db, BOB, () => db.query<{ account_id: string }>("select * from public.account_balances"));
    const bobAccounts = await asUser(db, BOB, () => db.query<{ id: string }>("select id from public.accounts"));
    expect(rows.rows.map((row) => row.account_id).sort()).toEqual(bobAccounts.rows.map((row) => row.id).sort());
  });
});
