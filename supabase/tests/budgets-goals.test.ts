import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser } from "./test-db";

// Budgets (DESIGN §6.5, D-25) and goals (§6.7, D-24), as the database
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

async function addCategory(userId: string, name: string, values: { kind?: string; parent?: string } = {}) {
  const [row] = await rows<{ id: string }>(
    userId,
    "insert into public.categories (kind, name, parent_id) values ($1, $2, $3) returning id",
    [values.kind ?? "expense", name, values.parent ?? null],
  );
  return row.id;
}

const setBudget = (userId: string, categoryId: string, month: string, amount: number) =>
  rows(
    userId,
    `insert into public.budgets (category_id, effective_from, amount_minor) values ($1, $2, $3)
     on conflict (category_id, effective_from) do update set amount_minor = excluded.amount_minor`,
    [categoryId, month, amount],
  );

const budgetFor = async (userId: string, categoryId: string, month: string) =>
  Number((await rows<{ amount: number }>(userId, "select public.budget_for_month($1, $2) as amount", [categoryId, month]))[0].amount);

describe("budgets", () => {
  it("applies a budget from its month until it changes, without rewriting the past (§6.5)", async () => {
    const food = await addCategory(ALICE, "Budget food");
    await setBudget(ALICE, food, "2026-09-01", 200_000);
    await setBudget(ALICE, food, "2026-11-01", 250_000);
    expect(await budgetFor(ALICE, food, "2026-08-01")).toBe(0);
    expect(await budgetFor(ALICE, food, "2026-09-01")).toBe(200_000);
    expect(await budgetFor(ALICE, food, "2026-10-01")).toBe(200_000);
    expect(await budgetFor(ALICE, food, "2026-11-01")).toBe(250_000);
    expect(await budgetFor(ALICE, food, "2027-06-01")).toBe(250_000);
  });

  it("starts on the 1st of a month, is never negative, and is for expense categories only", async () => {
    const food = await addCategory(ALICE, "Budget shape food");
    const salary = await addCategory(ALICE, "Budget shape salary", { kind: "income" });
    await expect(setBudget(ALICE, food, "2026-10-15", 100)).rejects.toThrow(/budgets_first_of_month/);
    await expect(setBudget(ALICE, food, "2026-10-01", -1)).rejects.toThrow(/budgets_amount_range/);
    await expect(setBudget(ALICE, salary, "2026-10-01", 100)).rejects.toThrow(/only expense categories/);
  });

  it("keeps sub-category budgets within the parent's, in every month (D-25)", async () => {
    const food = await addCategory(ALICE, "D25 food");
    const groceries = await addCategory(ALICE, "D25 groceries", { parent: food });
    const eatingOut = await addCategory(ALICE, "D25 eating out", { parent: food });

    // A sub-category budget needs a parent budget.
    await expect(setBudget(ALICE, groceries, "2026-10-01", 50_000)).rejects.toThrow(/add up to more/);

    await setBudget(ALICE, food, "2026-10-01", 200_000);
    await setBudget(ALICE, groceries, "2026-10-01", 120_000);
    await setBudget(ALICE, eatingOut, "2026-10-01", 80_000); // exactly the parent: allowed
    await expect(setBudget(ALICE, eatingOut, "2026-11-01", 80_001)).rejects.toThrow(/add up to more.*2026-11/);

    // Lowering the parent below its children is refused, in that month and later.
    await expect(setBudget(ALICE, food, "2026-12-01", 150_000)).rejects.toThrow(/add up to more.*2026-12/);
    // A change in an earlier month is checked against later months too.
    await setBudget(ALICE, food, "2027-01-01", 300_000);
    await setBudget(ALICE, groceries, "2027-01-01", 220_000);
    await expect(setBudget(ALICE, food, "2026-10-01", 199_999)).rejects.toThrow(/add up to more.*2026-10/);
  });

  it("checks a change against the later months it affects", async () => {
    const home = await addCategory(ALICE, "D25 home");
    const repairs = await addCategory(ALICE, "D25 repairs", { parent: home });
    await setBudget(ALICE, home, "2026-10-01", 100);
    await setBudget(ALICE, home, "2027-03-01", 50);
    await setBudget(ALICE, repairs, "2026-10-01", 40);
    // 60 is fine in November (home 100), but it also applies in March (home 50).
    await expect(setBudget(ALICE, repairs, "2026-11-01", 60)).rejects.toThrow(/add up to more.*2027-03/);
    await setBudget(ALICE, repairs, "2026-11-01", 50);
  });

  it("keeps history: a budget is never deleted, it is set to 0", async () => {
    const fun = await addCategory(ALICE, "Budget history fun");
    await setBudget(ALICE, fun, "2026-10-01", 30_000);
    await expect(rows(ALICE, "delete from public.budgets where category_id = $1", [fun])).rejects.toThrow(
      /permission denied/,
    );
    await setBudget(ALICE, fun, "2026-12-01", 0);
    expect(await budgetFor(ALICE, fun, "2026-11-01")).toBe(30_000);
    expect(await budgetFor(ALICE, fun, "2026-12-01")).toBe(0);
  });

  it("is private, refuses another user's category, and keeps a used category", async () => {
    const food = await addCategory(ALICE, "Budget private food");
    await setBudget(ALICE, food, "2026-10-01", 1_000);
    expect(await rows(BOB, "select * from public.budgets")).toEqual([]);
    await expect(setBudget(BOB, food, "2026-11-01", 1_000)).rejects.toThrow(/category not found/);
    await expect(rows(ALICE, "delete from public.categories where id = $1", [food])).rejects.toThrow(
      /budgets_category_id_fkey/,
    );
  });
});

describe("goals and contributions (D-24)", () => {
  async function addGoal(userId: string, name: string, target = 800_000) {
    const [row] = await rows<{ id: string }>(
      userId,
      "insert into public.goals (name, target_minor, target_date) values ($1, $2, '2027-03-31') returning id",
      [name, target],
    );
    return row.id;
  }
  const contribute = (userId: string, goalId: string, amount: number) =>
    rows(userId, "insert into public.goal_contributions (goal_id, occurred_on, amount_minor) values ($1, '2026-10-20', $2)", [
      goalId,
      amount,
    ]);

  it("adds and takes out contributions, without touching any balance", async () => {
    const laptop = await addGoal(ALICE, "New laptop");
    await contribute(ALICE, laptop, 50_000);
    await contribute(ALICE, laptop, -10_000);
    const [sum] = await rows<{ total: number }>(
      ALICE,
      "select sum(amount_minor) as total from public.goal_contributions where goal_id = $1",
      [laptop],
    );
    expect(Number(sum.total)).toBe(40_000);
    expect(await rows(ALICE, "select * from public.transactions")).toEqual([]);
  });

  it("checks the goal and the contribution", async () => {
    await expect(addGoal(ALICE, "Zero goal", 0)).rejects.toThrow(/goals_target_range/);
    await addGoal(ALICE, "Emergency fund");
    await expect(addGoal(ALICE, "emergency FUND")).rejects.toThrow(/goals_user_name_key/);
    const trip = await addGoal(ALICE, "Trip");
    await expect(contribute(ALICE, trip, 0)).rejects.toThrow(/goal_contributions_amount_range/);
  });

  it("keeps goals private and a goal with contributions from being deleted", async () => {
    const car = await addGoal(ALICE, "Car");
    await contribute(ALICE, car, 1_000);
    expect(await rows(BOB, "select * from public.goals")).toEqual([]);
    await expect(contribute(BOB, car, 1_000)).rejects.toThrow(/goal not found/);
    await expect(rows(ALICE, "delete from public.goals where id = $1", [car])).rejects.toThrow(
      /goal_contributions_goal_id_fkey/,
    );
    const empty = await addGoal(ALICE, "Empty goal");
    await expect(rows(ALICE, "delete from public.goals where id = $1 returning id", [empty])).resolves.toHaveLength(1);
  });
});
