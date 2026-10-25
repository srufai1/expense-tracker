import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

// Deleting a sub-category that has been used (D-44): its transactions and
// recurring items move to its parent, and its budgets are removed, all at
// once. A top-level category still follows D-32 (archive when used).

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
let account: string;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
  account = await one(
    ALICE,
    "insert into public.accounts (name, type, currency, opening_balance_on) values ('Cash', 'cash', 'GHS', '2026-10-01') returning id",
  );
});

afterAll(async () => {
  await db.close();
});

async function rows<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await asUser(db, userId, () => db.query<T>(sql, params))).rows;
}

async function one(userId: string, sql: string, params: unknown[] = []): Promise<string> {
  return (await rows<{ id: string }>(userId, sql, params))[0].id;
}

const addCategory = (userId: string, name: string, parent: string | null = null) =>
  one(userId, "insert into public.categories (kind, name, parent_id) values ('expense', $1, $2) returning id", [
    name,
    parent,
  ]);

const addExpense = (categoryId: string, amount: number) =>
  one(
    ALICE,
    `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
       fx_source, amount_ghs_minor, account_amount_minor)
     values ('expense', '2026-10-20', $1, $2, $3, 'GHS', 1, 'none', $3, $3) returning id`,
    [account, categoryId, amount],
  );

const addRule = (categoryId: string) =>
  one(
    ALICE,
    `insert into public.recurring_rules (kind, account_id, category_id, amount_minor, currency, frequency, day_of_month,
       starts_on, next_run_on)
     values ('expense', $1, $2, 5000, 'GHS', 'monthly', 25, '2026-10-25', '2026-10-25') returning id`,
    [account, categoryId],
  );

const setBudget = (categoryId: string, amount: number) =>
  rows(ALICE, "insert into public.budgets (category_id, effective_from, amount_minor) values ($1, '2026-10-01', $2)", [
    categoryId,
    amount,
  ]);

const deleteSub = (userId: string, id: string) =>
  rows(userId, "select public.delete_sub_category($1)", [id]);

describe("delete_sub_category", () => {
  it("moves the transactions and recurring items to the parent, removes the budget, then deletes it", async () => {
    const food = await addCategory(ALICE, "Food");
    const eatingOut = await addCategory(ALICE, "Eating out", food);
    const groceries = await addCategory(ALICE, "Groceries", food);
    const lunch = await addExpense(eatingOut, 2500);
    const dinner = await addExpense(eatingOut, 15200);
    const bread = await addExpense(groceries, 1000);
    const rule = await addRule(eatingOut);
    await setBudget(food, 150_000);
    await setBudget(eatingOut, 30_000);
    await setBudget(groceries, 50_000);

    await deleteSub(ALICE, eatingOut);

    const moved = await rows<{ id: string; category_id: string }>(
      ALICE,
      "select id, category_id from public.transactions where id = any($1) order by amount_minor",
      [[lunch, dinner, bread]],
    );
    expect(moved).toEqual([
      { id: bread, category_id: groceries },
      { id: lunch, category_id: food },
      { id: dinner, category_id: food },
    ]);
    expect(await rows(ALICE, "select category_id from public.recurring_rules where id = $1", [rule])).toEqual([
      { category_id: food },
    ]);
    // The parent's and the other sub-category's budgets stay.
    expect(
      await rows(ALICE, "select category_id, amount_minor from public.budgets order by amount_minor"),
    ).toEqual([
      { category_id: groceries, amount_minor: 50_000 },
      { category_id: food, amount_minor: 150_000 },
    ]);
    expect(await rows(ALICE, "select id from public.categories where id = $1", [eatingOut])).toEqual([]);
  });

  it("deletes an unused sub-category too", async () => {
    const home = await addCategory(ALICE, "Home");
    const garden = await addCategory(ALICE, "Garden", home);
    await deleteSub(ALICE, garden);
    expect(await rows(ALICE, "select id from public.categories where id = $1", [garden])).toEqual([]);
  });

  it("refuses a top-level category: D-32 still applies to those", async () => {
    const transport = await addCategory(ALICE, "Transport");
    await addExpense(transport, 700);
    await expect(deleteSub(ALICE, transport)).rejects.toThrow(/not a sub-category/);
    expect(await rows(ALICE, "select id from public.categories where id = $1", [transport])).toHaveLength(1);
  });

  it("cannot touch another user's sub-category, and needs a signed-in user", async () => {
    const bills = await addCategory(ALICE, "Bills");
    const water = await addCategory(ALICE, "Water", bills);
    await addExpense(water, 4000);
    await expect(deleteSub(BOB, water)).rejects.toThrow(/category not found/);
    await expect(asAnon(db, () => db.query("select public.delete_sub_category($1)", [water]))).rejects.toThrow(
      /permission denied/,
    );
    expect(await rows(ALICE, "select id from public.categories where id = $1", [water])).toHaveLength(1);
  });
});
