import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole, asUser, createTestDb, createUser } from "./test-db";

// Recurring rules (DESIGN §6.6, D-38) and the daily job's database rights.

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

async function addAccount(userId: string, name: string, currency = "GHS") {
  const [row] = await rows<{ id: string }>(
    userId,
    "insert into public.accounts (name, type, currency, opening_balance_on) values ($1, 'cash', $2, '2026-10-01') returning id",
    [name, currency],
  );
  return row.id;
}

async function addCategory(userId: string, name: string, kind = "expense") {
  const [row] = await rows<{ id: string }>(
    userId,
    "insert into public.categories (kind, name) values ($1, $2) returning id",
    [kind, name],
  );
  return row.id;
}

type Rule = {
  kind?: string;
  account: string;
  category?: string | null;
  to?: string | null;
  amount?: number;
  currency?: string;
  frequency?: string;
  weekday?: number | null;
  day?: number | null;
  startsOn?: string;
  endsOn?: string | null;
  nextRunOn?: string;
};

async function addRule(userId: string, rule: Rule) {
  const [row] = await rows<{ id: string }>(
    userId,
    `insert into public.recurring_rules (kind, account_id, category_id, to_account_id, amount_minor, currency,
       frequency, weekday, day_of_month, starts_on, ends_on, next_run_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [
      rule.kind ?? "expense",
      rule.account,
      rule.category ?? null,
      rule.to ?? null,
      rule.amount ?? 5000,
      rule.currency ?? "GHS",
      rule.frequency ?? "monthly",
      rule.weekday ?? null,
      rule.frequency === "weekly" ? null : (rule.day ?? 25),
      rule.startsOn ?? "2026-10-25",
      rule.endsOn ?? null,
      rule.nextRunOn ?? "2026-10-25",
    ],
  );
  return row.id;
}

// What the daily job inserts for one occurrence (src/lib/recurring-run.ts).
const insertOccurrence = (userId: string, ruleId: string, account: string, category: string, date: string) =>
  asServiceRole(db, () =>
    db.query(
      `insert into public.transactions (user_id, kind, occurred_on, account_id, category_id, amount_minor, currency,
         fx_rate, fx_source, amount_ghs_minor, account_amount_minor, recurring_rule_id, occurrence_date, note)
       values ($1, 'expense', $5, $2, $3, 5000, 'GHS', 1, 'none', 5000, 5000, $4, $5, 'Rent')
       on conflict (recurring_rule_id, occurrence_date) do nothing`,
      [userId, account, category, ruleId, date],
    ),
  );

describe("recurring_rules: ownership and shape", () => {
  it("keeps each user's rules private and refuses another user's account or category", async () => {
    const account = await addAccount(ALICE, "Alice rent account");
    const rent = await addCategory(ALICE, "Alice rent");
    await addRule(ALICE, { account, category: rent });
    expect(await rows(BOB, "select * from public.recurring_rules")).toEqual([]);

    const bobAccount = await addAccount(BOB, "Bob account");
    const bobCategory = await addCategory(BOB, "Bob rent");
    await expect(addRule(BOB, { account, category: bobCategory })).rejects.toThrow(/account not found/);
    await expect(addRule(BOB, { account: bobAccount, category: rent })).rejects.toThrow(/category not found/);
  });

  it("checks the schedule, the dates, the amount and the kind", async () => {
    const account = await addAccount(ALICE, "Alice shape account");
    const food = await addCategory(ALICE, "Alice shape food");
    const salary = await addCategory(ALICE, "Alice shape salary", "income");
    await expect(addRule(ALICE, { account, category: food, frequency: "weekly", weekday: 8 })).rejects.toThrow(
      /recurring_rules_schedule/,
    );
    await expect(addRule(ALICE, { account, category: food, day: 32 })).rejects.toThrow(/recurring_rules_schedule/);
    await expect(addRule(ALICE, { account, category: food, frequency: "daily" })).rejects.toThrow(
      /recurring_rules_schedule/,
    );
    await expect(addRule(ALICE, { account, category: food, endsOn: "2026-10-24" })).rejects.toThrow(
      /recurring_rules_dates/,
    );
    await expect(addRule(ALICE, { account, category: food, nextRunOn: "2026-10-24" })).rejects.toThrow(
      /recurring_rules_next_run_from_start/,
    );
    await expect(addRule(ALICE, { account, category: food, amount: 0 })).rejects.toThrow(/recurring_rules_amount_range/);
    await expect(addRule(ALICE, { account, category: salary })).rejects.toThrow(/category kind must match/);
    await expect(addRule(ALICE, { account, category: null })).rejects.toThrow(/recurring_rules_shape/);
  });

  it("allows a recurring transfer only between accounts in one currency (D-38)", async () => {
    const momo = await addAccount(ALICE, "Alice rule MoMo");
    const bank = await addAccount(ALICE, "Alice rule bank");
    const usd = await addAccount(ALICE, "Alice rule USD", "USD");
    await expect(addRule(ALICE, { kind: "transfer", account: momo, to: bank })).resolves.toBeDefined();
    await expect(addRule(ALICE, { kind: "transfer", account: momo, to: usd })).rejects.toThrow(/in one currency/);
    await expect(addRule(ALICE, { kind: "transfer", account: momo, to: momo })).rejects.toThrow(
      /recurring_rules_two_accounts/,
    );
  });

  it("stops an account or category with recurring items from being deleted", async () => {
    const account = await addAccount(ALICE, "Alice kept account");
    const food = await addCategory(ALICE, "Alice kept food");
    await addRule(ALICE, { account, category: food });
    await expect(rows(ALICE, "delete from public.accounts where id = $1", [account])).rejects.toThrow(
      /recurring_rules_account_id_fkey/,
    );
    await expect(rows(ALICE, "delete from public.categories where id = $1", [food])).rejects.toThrow(
      /recurring_rules_category_id_fkey/,
    );
  });
});

describe("the daily job's rights (service_role)", () => {
  it("creates an occurrence once, however often it runs (§6.6)", async () => {
    const account = await addAccount(ALICE, "Alice job account");
    const rent = await addCategory(ALICE, "Alice job rent");
    const rule = await addRule(ALICE, { account, category: rent });

    await insertOccurrence(ALICE, rule, account, rent, "2026-10-25");
    await insertOccurrence(ALICE, rule, account, rent, "2026-10-25");
    const created = await rows<{ occurrence_date: Date; user_id: string }>(
      ALICE,
      "select occurrence_date, user_id from public.transactions where recurring_rule_id = $1",
      [rule],
    );
    expect(created).toHaveLength(1);
    expect(created[0].user_id).toBe(ALICE);
  });

  it("moves next_run_on forward, but changes nothing else on a rule", async () => {
    const account = await addAccount(ALICE, "Alice job account 2");
    const rent = await addCategory(ALICE, "Alice job rent 2");
    const rule = await addRule(ALICE, { account, category: rent });
    await asServiceRole(db, () =>
      db.query("update public.recurring_rules set next_run_on = '2026-11-25' where id = $1", [rule]),
    );
    await expect(
      asServiceRole(db, () => db.query("update public.recurring_rules set amount_minor = 1 where id = $1", [rule])),
    ).rejects.toThrow(/permission denied/);
  });

  it("still checks ownership: an item cannot use another user's account", async () => {
    const aliceAccount = await addAccount(ALICE, "Alice job account 3");
    const bobAccount = await addAccount(BOB, "Bob job account 3");
    const bobRent = await addCategory(BOB, "Bob job rent 3");
    const bobRule = await addRule(BOB, { account: bobAccount, category: bobRent });
    await expect(insertOccurrence(BOB, bobRule, aliceAccount, bobRent, "2026-10-25")).rejects.toThrow(
      /account not found/,
    );
  });
});

describe("deleting a rule", () => {
  it("keeps the transactions it created, without the link", async () => {
    const account = await addAccount(ALICE, "Alice delete-rule account");
    const rent = await addCategory(ALICE, "Alice delete-rule rent");
    const rule = await addRule(ALICE, { account, category: rent });
    await insertOccurrence(ALICE, rule, account, rent, "2026-10-25");

    await rows(ALICE, "delete from public.recurring_rules where id = $1", [rule]);
    const kept = await rows<{ recurring_rule_id: string | null; occurrence_date: Date }>(
      ALICE,
      "select recurring_rule_id, occurrence_date from public.transactions where account_id = $1",
      [account],
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].recurring_rule_id).toBeNull();
    expect(kept[0].occurrence_date.toISOString().slice(0, 10)).toBe("2026-10-25");
  });
});

describe("Codex review on PR #8", () => {
  it("locks an account's currency while a recurring transfer uses it (D-38)", async () => {
    const momo = await addAccount(ALICE, "Alice lock MoMo");
    const bank = await addAccount(ALICE, "Alice lock bank");
    await addRule(ALICE, { kind: "transfer", account: momo, to: bank });
    for (const id of [momo, bank]) {
      await expect(rows(ALICE, "update public.accounts set currency = 'USD' where id = $1", [id])).rejects.toThrow(
        /currency of an account with transactions or recurring transfers cannot change/,
      );
    }
    // An expense rule converts (M-7, D-36), so it does not lock the currency.
    const card = await addAccount(ALICE, "Alice lock card");
    const subs = await addCategory(ALICE, "Alice lock subs");
    await addRule(ALICE, { account: card, category: subs });
    await expect(
      rows(ALICE, "update public.accounts set currency = 'USD' where id = $1 returning id", [card]),
    ).resolves.toHaveLength(1);
  });

  it("lets Undo put a created transaction back with its recurring link", async () => {
    const account = await addAccount(ALICE, "Alice undo-link account");
    const rent = await addCategory(ALICE, "Alice undo-link rent");
    const rule = await addRule(ALICE, { account, category: rent });
    await insertOccurrence(ALICE, rule, account, rent, "2026-10-25");
    const [created] = await rows<{ id: string }>(ALICE, "select id from public.transactions where recurring_rule_id = $1", [rule]);

    await rows(ALICE, "delete from public.transactions where id = $1", [created.id]);
    await rows(
      ALICE,
      `insert into public.transactions (id, kind, occurred_on, account_id, category_id, amount_minor, currency,
         amount_ghs_minor, account_amount_minor, recurring_rule_id, occurrence_date)
       values ($1, 'expense', '2026-10-25', $2, $3, 5000, 'GHS', 5000, 5000, $4, '2026-10-25')`,
      [created.id, account, rent, rule],
    );
    // The daily job then finds that date taken and creates nothing more.
    await insertOccurrence(ALICE, rule, account, rent, "2026-10-25");
    expect(await rows(ALICE, "select id from public.transactions where recurring_rule_id = $1", [rule])).toHaveLength(1);
  });

  it("never lets a user attach a transaction to another user's recurring item", async () => {
    const aliceAccount = await addAccount(ALICE, "Alice guarded account");
    const rent = await addCategory(ALICE, "Alice guarded rent");
    const aliceRule = await addRule(ALICE, { account: aliceAccount, category: rent });
    const bobAccount = await addAccount(BOB, "Bob guarded account");
    const bobFood = await addCategory(BOB, "Bob guarded food");
    // Taking Alice's (rule, date) would stop her item being created that day.
    await expect(
      rows(
        BOB,
        `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency,
           amount_ghs_minor, account_amount_minor, recurring_rule_id, occurrence_date)
         values ('expense', '2026-10-25', $1, $2, 100, 'GHS', 100, 100, $3, '2026-10-25')`,
        [bobAccount, bobFood, aliceRule],
      ),
    ).rejects.toThrow(/recurring item not found/);
  });
});
