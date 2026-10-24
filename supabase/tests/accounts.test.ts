import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

// Runs the real migration in an in-memory Postgres and checks what the
// database itself enforces — the last of the three validation layers.

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

type Account = {
  id: string;
  user_id: string;
  name: string;
  opening_balance_minor: number;
  opening_balance_on: Date;
  updated_at: Date;
};

async function addAccount(
  userId: string,
  values: { name: string; type?: string; currency?: string; opening?: number | string },
) {
  return asUser(db, userId, async () => {
    const result = await db.query<Account>(
      `insert into public.accounts (name, type, currency, opening_balance_minor)
       values ($1, $2, $3, $4) returning *`,
      [values.name, values.type ?? "cash", values.currency ?? "GHS", values.opening ?? 0],
    );
    return result.rows[0];
  });
}

describe("accounts: ownership (Row-Level Security)", () => {
  it("saves a new account for the signed-in user, with today's opening date", async () => {
    const account = await addAccount(ALICE, { name: "Alice cash", opening: 42000 });
    expect(account.user_id).toBe(ALICE);
    expect(Number(account.opening_balance_minor)).toBe(42000);
    expect(account.opening_balance_on.toISOString().slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10), // Accra is UTC+0
    );
  });

  it("never shows one user's accounts to another user", async () => {
    await addAccount(ALICE, { name: "Alice bank", type: "bank" });
    const bobSees = await asUser(db, BOB, () =>
      db.query("select name from public.accounts"),
    );
    expect(bobSees.rows).toEqual([]);
  });

  it("does not let another user change or delete an account", async () => {
    const account = await addAccount(ALICE, { name: "Alice MoMo", type: "mobile_money" });
    const updated = await asUser(db, BOB, () =>
      db.query("update public.accounts set name = 'stolen' where id = $1", [account.id]),
    );
    const deleted = await asUser(db, BOB, () =>
      db.query("delete from public.accounts where id = $1", [account.id]),
    );
    expect(updated.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
  });

  it("does not let a user create an account for someone else", async () => {
    await expect(
      asUser(db, BOB, () =>
        db.query(
          "insert into public.accounts (user_id, name, type, currency) values ($1, 'x', 'cash', 'GHS')",
          [ALICE],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("gives signed-out visitors no access at all", async () => {
    await expect(asAnon(db, () => db.query("select * from public.accounts"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("does not let the app change who owns an account or when it was created", async () => {
    const account = await addAccount(ALICE, { name: "Alice card", type: "card" });
    await expect(
      asUser(db, ALICE, () =>
        db.query("update public.accounts set user_id = $1 where id = $2", [BOB, account.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ALICE, () =>
        db.query("update public.accounts set created_at = now() where id = $1", [account.id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("accounts: rules the database enforces", () => {
  it("allows a negative opening balance (D-29)", async () => {
    const account = await addAccount(ALICE, { name: "Overdraft", type: "bank", opening: -150000 });
    expect(Number(account.opening_balance_minor)).toBe(-150000);
  });

  it("rejects names that are empty, too long or have spaces around them", async () => {
    await expect(addAccount(ALICE, { name: "" })).rejects.toThrow(/accounts_name_length/);
    await expect(addAccount(ALICE, { name: "x".repeat(61) })).rejects.toThrow(/accounts_name_length/);
    await expect(addAccount(ALICE, { name: " Cash " })).rejects.toThrow(/accounts_name_trimmed/);
  });

  it("rejects unknown account types and currencies", async () => {
    await expect(addAccount(ALICE, { name: "A", type: "crypto" })).rejects.toThrow(/accounts_type_valid/);
    await expect(addAccount(ALICE, { name: "B", currency: "EUR" })).rejects.toThrow(
      /accounts_currency_valid/,
    );
  });

  it("rejects opening balances beyond 999,999,999.99 either way", async () => {
    await expect(addAccount(ALICE, { name: "Big", opening: "100000000000" })).rejects.toThrow(
      /accounts_opening_balance_range/,
    );
    await expect(addAccount(ALICE, { name: "Small", opening: "-100000000000" })).rejects.toThrow(
      /accounts_opening_balance_range/,
    );
  });

  it("rejects an opening date in the future (D-30), on insert and on update", async () => {
    await expect(
      asUser(db, ALICE, () =>
        db.query(
          `insert into public.accounts (name, type, currency, opening_balance_on)
           values ('Future', 'cash', 'GHS', (now() at time zone 'Africa/Accra')::date + 1)`,
        ),
      ),
    ).rejects.toThrow(/accounts_opening_balance_on_not_future/);

    const account = await addAccount(ALICE, { name: "Today" });
    await expect(
      asUser(db, ALICE, () =>
        db.query(
          `update public.accounts
           set opening_balance_on = (now() at time zone 'Africa/Accra')::date + 1 where id = $1`,
          [account.id],
        ),
      ),
    ).rejects.toThrow(/accounts_opening_balance_on_not_future/);
  });

  it("refuses two accounts with the same name for one user, ignoring case", async () => {
    await addAccount(ALICE, { name: "Savings", type: "bank" });
    await expect(addAccount(ALICE, { name: "SAVINGS", type: "bank" })).rejects.toThrow(
      /accounts_user_id_name_key/,
    );
  });

  it("lets different users use the same name", async () => {
    await addAccount(ALICE, { name: "Wallet" });
    const bobs = await addAccount(BOB, { name: "Wallet" });
    expect(bobs.user_id).toBe(BOB);
  });

  it("updates updated_at on every change", async () => {
    const account = await addAccount(ALICE, { name: "Before" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = await asUser(db, ALICE, () =>
      db.query<Account>("update public.accounts set name = 'After' where id = $1 returning *", [
        account.id,
      ]),
    );
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(account.updated_at.getTime());
  });
});
