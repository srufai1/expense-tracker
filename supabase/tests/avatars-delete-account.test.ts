import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

// The profile photo bucket (D-50) and "Delete my account" (D-51).

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function rows<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await asUser(db, userId, () => db.query<T>(sql, params))).rows;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

afterAll(async () => {
  await db.close();
});

const upload = (userId: string, name: string, bucket = "avatars") =>
  rows(userId, "insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)", [bucket, name, userId]);

describe("the avatars bucket (D-50)", () => {
  it("is private, for JPEG photos up to 1 MB", async () => {
    const [bucket] = await rows<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      ALICE,
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'",
    );
    expect(bucket).toEqual({ public: false, file_size_limit: 1_048_576, allowed_mime_types: ["image/jpeg"] });
  });

  it("holds one photo per user, at {user_id}/avatar.jpg, in their own folder only", async () => {
    await upload(ALICE, `${ALICE}/avatar.jpg`);
    await expect(upload(ALICE, `${BOB}/avatar.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/other.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/x/avatar.jpg`)).rejects.toThrow(/row-level security/);
    expect(await rows(ALICE, "select name from storage.objects where bucket_id = 'avatars'")).toEqual([
      { name: `${ALICE}/avatar.jpg` },
    ]);
  });

  it("keeps each photo private to its owner, who can replace or delete it", async () => {
    expect(await rows(BOB, "select name from storage.objects where bucket_id = 'avatars'")).toEqual([]);
    await rows(BOB, "delete from storage.objects where name = $1", [`${ALICE}/avatar.jpg`]);
    expect(await rows(ALICE, "select name from storage.objects where bucket_id = 'avatars'")).toHaveLength(1);
    await rows(ALICE, "update storage.objects set name = name where name = $1", [`${ALICE}/avatar.jpg`]);
    await rows(ALICE, "delete from storage.objects where name = $1", [`${ALICE}/avatar.jpg`]);
    expect(await rows(ALICE, "select name from storage.objects where bucket_id = 'avatars'")).toEqual([]);
  });
});

describe("delete_my_account (D-51)", () => {
  it("deletes the signed-in user and all their data, and nobody else's", async () => {
    for (const user of [ALICE, BOB]) {
      const [account] = await rows<{ id: string }>(
        user,
        "insert into public.accounts (name, type, currency, opening_balance_on) values ('Cash', 'cash', 'GHS', '2026-10-01') returning id",
      );
      const [category] = await rows<{ id: string }>(
        user,
        "insert into public.categories (kind, name) values ('expense', 'Food') returning id",
      );
      await rows(
        user,
        `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
           fx_source, amount_ghs_minor, account_amount_minor)
         values ('expense', '2026-10-20', $1, $2, 2500, 'GHS', 1, 'none', 2500, 2500)`,
        [account.id, category.id],
      );
      await rows(user, "insert into public.settings (weekly_email) values (true)");
    }

    await rows(ALICE, "select public.delete_my_account()");

    const count = async (table: string, user: string) =>
      Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table} where user_id = $1`, [user])).rows[0].n);
    for (const table of ["public.accounts", "public.categories", "public.transactions", "public.settings"]) {
      expect(await count(table, ALICE)).toBe(0);
      expect(await count(table, BOB)).toBe(1);
    }
    const users = await db.query<{ id: string }>("select id from auth.users order by id");
    expect(users.rows.map((r) => r.id)).toEqual([BOB]);
  });

  it("deletes a full, real-looking account: starter categories (with the system Fees & Charges), sub-categories, budgets, a goal, recurring items and a transfer with a fee", async () => {
    const CAROL = "00000000-0000-4000-8000-00000000000c";
    await createUser(db, CAROL);
    const one = async (sql: string, params: unknown[] = []) => (await rows<{ id: string }>(CAROL, sql, params))[0]?.id;
    await rows(CAROL, "select public.seed_starter_categories()");
    const cash = await one(
      "insert into public.accounts (name, type, currency, opening_balance_on) values ('Cash', 'cash', 'GHS', '2026-10-01') returning id",
    );
    const momo = await one(
      "insert into public.accounts (name, type, currency, opening_balance_on) values ('MoMo', 'mobile_money', 'GHS', '2026-10-01') returning id",
    );
    const food = await one("select id from public.categories where name = 'Food' and parent_id is null");
    const groceries = await one("select id from public.categories where name = 'Groceries'");
    await rows(
      CAROL,
      `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
         fx_source, amount_ghs_minor, account_amount_minor)
       values ('expense', '2026-10-20', $1, $2, 2500, 'GHS', 1, 'none', 2500, 2500)`,
      [cash, groceries],
    );
    // A transfer with a fee: the fee is a Fees & Charges expense that points to its transfer.
    await rows(
      CAROL,
      "select public.save_transfer(null, '2026-10-21', $1, $2, 10000, 10000, 'GHS', 1, 'none', null, 10000, 150, 150, '')",
      [cash, momo],
    );
    await rows(CAROL, "insert into public.budgets (category_id, effective_from, amount_minor) values ($1, '2026-10-01', 150000)", [food]);
    await rows(CAROL, "insert into public.budgets (category_id, effective_from, amount_minor) values ($1, '2026-10-01', 50000)", [groceries]);
    const goal = await one(
      "insert into public.goals (name, target_minor, target_date) values ('Laptop', 800000, '2027-03-31') returning id",
    );
    await rows(CAROL, "insert into public.goal_contributions (goal_id, occurred_on, amount_minor) values ($1, '2026-10-15', 20000)", [goal]);
    await rows(
      CAROL,
      `insert into public.recurring_rules (kind, account_id, category_id, amount_minor, currency, frequency, day_of_month,
         starts_on, next_run_on)
       values ('expense', $1, $2, 5000, 'GHS', 'monthly', 25, '2026-10-25', '2026-10-25')`,
      [cash, groceries],
    );
    await rows(
      CAROL,
      `insert into public.recurring_rules (kind, goal_id, amount_minor, currency, frequency, weekday, starts_on, next_run_on)
       values ('goal_contribution', $1, 26100, 'GHS', 'weekly', 1, '2026-10-26', '2026-10-26')`,
      [goal],
    );
    await rows(CAROL, "insert into public.settings (weekly_email) values (true)");

    await rows(CAROL, "select public.delete_my_account()");

    const tables = ["accounts", "categories", "transactions", "budgets", "goals", "goal_contributions", "recurring_rules", "settings"];
    for (const table of tables) {
      const { rows: left } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [CAROL]);
      expect(`${table}: ${left[0].n}`).toBe(`${table}: 0`);
    }
    expect((await db.query("select id from auth.users where id = $1", [CAROL])).rows).toEqual([]);
  });

  it("still never lets a user delete Fees & Charges on its own", async () => {
    const DAN = "00000000-0000-4000-8000-00000000000d";
    await createUser(db, DAN);
    await rows(DAN, "select public.seed_starter_categories()");
    await expect(rows(DAN, "delete from public.categories where system_key = 'fees'")).rejects.toThrow(/system category/);
  });

  it("refuses a signed-out visitor", async () => {
    await expect(asAnon(db, () => db.query("select public.delete_my_account()"))).rejects.toThrow(/permission denied/);
  });
});
