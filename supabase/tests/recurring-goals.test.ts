import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole, asUser, createTestDb, createUser } from "./test-db";

// Recurring goal contributions (DESIGN §6.6 goal_id, §6.7, D-40): a rule of
// kind 'goal_contribution' points to a goal, has no account or category,
// and the daily job adds a contribution for each date.

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

async function addGoal(userId: string, name: string) {
  const [row] = await rows<{ id: string }>(
    userId,
    "insert into public.goals (name, target_minor, target_date) values ($1, 800000, '2027-03-31') returning id",
    [name],
  );
  return row.id;
}

async function addAccount(userId: string, name: string) {
  const [row] = await rows<{ id: string }>(
    userId,
    "insert into public.accounts (name, type, currency, opening_balance_on) values ($1, 'cash', 'GHS', '2026-10-01') returning id",
    [name],
  );
  return row.id;
}

type GoalRule = { goal: string | null; account?: string | null; category?: string | null; currency?: string };

async function addGoalRule(userId: string, rule: GoalRule) {
  const [row] = await rows<{ id: string }>(
    userId,
    `insert into public.recurring_rules (kind, goal_id, account_id, category_id, amount_minor, currency,
       frequency, weekday, starts_on, next_run_on)
     values ('goal_contribution', $1, $2, $3, 18000, $4, 'weekly', 1, '2026-10-26', '2026-10-26') returning id`,
    [rule.goal, rule.account ?? null, rule.category ?? null, rule.currency ?? "GHS"],
  );
  return row.id;
}

const jobInsert = (userId: string, goalId: string, ruleId: string, date: string) =>
  asServiceRole(db, () =>
    db.query(
      `insert into public.goal_contributions (user_id, goal_id, occurred_on, amount_minor, recurring_rule_id, occurrence_date)
       values ($1, $2, $3, 18000, $4, $3)
       on conflict (recurring_rule_id, occurrence_date) do nothing`,
      [userId, goalId, date, ruleId],
    ),
  );

describe("recurring goal contributions", () => {
  it("are a rule with a goal, in GHS, without an account or category", async () => {
    const fund = await addGoal(ALICE, "Emergency fund");
    const cash = await addAccount(ALICE, "Goal rule cash");
    await addGoalRule(ALICE, { goal: fund });
    await expect(addGoalRule(ALICE, { goal: null })).rejects.toThrow(/recurring_rules_shape/);
    await expect(addGoalRule(ALICE, { goal: fund, account: cash })).rejects.toThrow(/recurring_rules_shape/);
    await expect(addGoalRule(ALICE, { goal: fund, currency: "USD" })).rejects.toThrow(/recurring_rules_shape/);
  });

  it("keep the other kinds' shape: an expense needs an account and no goal", async () => {
    const fund = await addGoal(ALICE, "Shape fund");
    const cash = await addAccount(ALICE, "Shape cash");
    const [food] = await rows<{ id: string }>(
      ALICE,
      "insert into public.categories (kind, name) values ('expense', 'Shape food') returning id",
    );
    const expense = (account: string | null, goal: string | null) =>
      rows(
        ALICE,
        `insert into public.recurring_rules (kind, account_id, category_id, goal_id, amount_minor, currency,
           frequency, day_of_month, starts_on, next_run_on)
         values ('expense', $1, $2, $3, 5000, 'GHS', 'monthly', 25, '2026-10-25', '2026-10-25')`,
        [account, food.id, goal],
      );
    await expense(cash, null);
    await expect(expense(null, null)).rejects.toThrow(/recurring_rules_shape/);
    await expect(expense(cash, fund)).rejects.toThrow(/recurring_rules_shape/);
  });

  it("refuse another user's goal", async () => {
    const bobs = await addGoal(BOB, "Bob's goal");
    await expect(addGoalRule(ALICE, { goal: bobs })).rejects.toThrow(/goal not found/);
  });

  it("let the daily job add one contribution per date, never twice", async () => {
    const fund = await addGoal(ALICE, "Job fund");
    const rule = await addGoalRule(ALICE, { goal: fund });
    await jobInsert(ALICE, fund, rule, "2026-10-26");
    await jobInsert(ALICE, fund, rule, "2026-10-26");
    await jobInsert(ALICE, fund, rule, "2026-11-02");
    const made = await rows<{ occurred_on: string; occurrence_date: string }>(
      ALICE,
      "select occurred_on::text, occurrence_date::text from public.goal_contributions where recurring_rule_id = $1 order by 1",
      [rule],
    );
    expect(made).toEqual([
      { occurred_on: "2026-10-26", occurrence_date: "2026-10-26" },
      { occurred_on: "2026-11-02", occurrence_date: "2026-11-02" },
    ]);
  });

  it("keep the contributions when the rule is deleted, and keep a goal with a rule", async () => {
    const fund = await addGoal(ALICE, "Kept fund");
    const rule = await addGoalRule(ALICE, { goal: fund });
    const empty = await addGoal(ALICE, "Ruled but empty");
    await addGoalRule(ALICE, { goal: empty });
    await expect(rows(ALICE, "delete from public.goals where id = $1", [empty])).rejects.toThrow(
      /recurring_rules_goal_id_fkey/,
    );

    await jobInsert(ALICE, fund, rule, "2026-10-26");
    await rows(ALICE, "delete from public.recurring_rules where id = $1", [rule]);
    const kept = await rows<{ recurring_rule_id: string | null; occurrence_date: string }>(
      ALICE,
      "select recurring_rule_id, occurrence_date::text from public.goal_contributions where goal_id = $1",
      [fund],
    );
    expect(kept).toEqual([{ recurring_rule_id: null, occurrence_date: "2026-10-26" }]);
  });

  it("refuse a contribution that points to someone else's rule", async () => {
    const alicesFund = await addGoal(ALICE, "Alice link fund");
    const alicesRule = await addGoalRule(ALICE, { goal: alicesFund });
    const bobsFund = await addGoal(BOB, "Bob link fund");
    await expect(jobInsert(BOB, bobsFund, alicesRule, "2026-10-26")).rejects.toThrow(/recurring item not found/);
    // The user's own form cannot set the link at all.
    await expect(
      rows(
        ALICE,
        `insert into public.goal_contributions (goal_id, occurred_on, amount_minor, recurring_rule_id, occurrence_date)
         values ($1, '2026-10-26', 100, $2, '2026-10-26')`,
        [alicesFund, alicesRule],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
