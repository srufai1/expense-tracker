import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

// School money (D-54): Morning classes, the savings fund, and the money held
// for the school counted in the Cash balance but never as income.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
let cash: string;
let income: string;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
  cash = await one(
    ALICE,
    "insert into public.accounts (name, type, currency, opening_balance_minor, opening_balance_on) values ('Cash', 'cash', 'GHS', 10000, '2026-10-01') returning id",
  );
  income = await one(ALICE, "insert into public.categories (kind, name) values ('income', 'School money') returning id");
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

const balance = async (userId = ALICE, account = cash) =>
  Number((await rows<{ balance_minor: number }>(userId, "select balance_minor from public.account_balances where account_id = $1", [account]))[0].balance_minor);

const held = async (userId = ALICE) =>
  Number((await rows<{ total: number | null }>(userId, "select sum(amount_minor) as total from public.school_cash_moves"))[0].total ?? 0);

const addDay = (day: string, full: [number, number, number], less: [number, number, number] = [0, 0, 0]) =>
  rows(
    ALICE,
    `insert into public.mc_days (day, full_1, full_2, full_3, less_1_minor, less_2_minor, less_3_minor)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [day, ...full, ...less],
  );

const settle = (args: {
  week: string;
  on?: string;
  rule?: string;
  day?: string | null;
  savings: number;
  leftover?: number;
  markers: number;
  assistant: number;
  each: number;
  sharers: string[];
}) =>
  rows<{ mc_settle: string }>(
    ALICE,
    "select public.mc_settle($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [args.week, args.on ?? "2026-10-23", args.rule ?? "all", args.day ?? "2026-10-23", args.savings, args.leftover ?? 0, args.markers, args.assistant, args.each, args.sharers],
  );

let me: string;
let mensah: string;
let owusu: string;
let head: string;

describe("setup", () => {
  it("needs the user's own GHS account and income category", async () => {
    const usd = await one(
      ALICE,
      "insert into public.accounts (name, type, currency) values ('Dollars', 'card', 'USD') returning id",
    );
    await expect(
      rows(ALICE, "insert into public.school_settings (account_id, income_category_id) values ($1, $2)", [usd, income]),
    ).rejects.toThrow(/GHS accounts/);
    await expect(
      rows(BOB, "insert into public.school_settings (account_id, income_category_id) values ($1, $2)", [cash, income]),
    ).rejects.toThrow(/GHS accounts/);
    await rows(ALICE, "insert into public.school_settings (account_id, income_category_id) values ($1, $2)", [cash, income]);
    me = await one(ALICE, "insert into public.mc_sharers (name, is_me) values ('Me', true) returning id");
    mensah = await one(ALICE, "insert into public.mc_sharers (name) values ('Mr Mensah') returning id");
    owusu = await one(ALICE, "insert into public.mc_sharers (name) values ('Mrs Owusu') returning id");
    head = await one(ALICE, "insert into public.mc_sharers (name) values ('Headmaster') returning id");
    await expect(rows(ALICE, "insert into public.mc_sharers (name, is_me) values ('Me again', true)")).rejects.toThrow(/duplicate/);
  });
});

describe("Morning classes", () => {
  it("collections go into Cash, held for the school, not as income", async () => {
    // The full week from the pictures: 598.00.
    await addDay("2026-10-19", [14, 14, 13]);
    await addDay("2026-10-20", [14, 13, 13]);
    await addDay("2026-10-21", [14, 14, 14]);
    await addDay("2026-10-22", [13, 12, 12], [0, 400, 0]);
    await addDay("2026-10-23", [13, 13, 12]);
    expect(await held()).toBe(59800);
    expect(await balance()).toBe(10000 + 59800);
    const account = await rows(ALICE, "select account_id from public.mc_days where day = '2026-10-19'");
    expect(account).toEqual([{ account_id: cash }]);
    expect(await rows(ALICE, "select id from public.transactions")).toEqual([]);
  });

  it("refuses weekends, future class days and mixed no-class days", async () => {
    await expect(addDay("2026-10-24", [1, 0, 0])).rejects.toThrow(/mc_days_weekday/);
    await expect(addDay("2099-01-05", [1, 0, 0])).rejects.toThrow(/future/);
    await expect(
      rows(ALICE, "insert into public.mc_days (day, no_class, reason, full_1) values ('2026-10-26', true, 'holiday', 3)"),
    ).rejects.toThrow(/mc_days_shape/);
    // A holiday may be marked ahead.
    await rows(ALICE, "insert into public.mc_days (day, no_class, reason, note) values ('2099-01-05', true, 'holiday', 'New year')");
  });

  it("settles a full week: every pesewa is accounted for, my share becomes income", async () => {
    await expect(
      settle({ week: "2026-10-19", savings: 9500, markers: 2500, assistant: 4000, each: 8476, sharers: [me, mensah, owusu, head] }),
    ).rejects.toThrow(/do not add up/);
    await settle({ week: "2026-10-19", savings: 9500, markers: 2500, assistant: 4000, each: 8475, sharers: [me, mensah, owusu, head] });

    const [week] = await rows(ALICE, "select class_days, collected_minor, school_minor, savings_minor from public.mc_weeks");
    expect(week).toEqual({ class_days: 5, collected_minor: 59800, school_minor: 9900, savings_minor: 9500 });
    const shares = await rows<{ name: string; amount_minor: number; paid_on: string | null; transaction_id: string | null }>(
      ALICE,
      "select name, amount_minor, paid_on::text, transaction_id from public.mc_shares order by is_me desc, name",
    );
    expect(shares.map((s) => [s.name, s.amount_minor, s.paid_on])).toEqual([
      ["Me", 8475, "2026-10-23"],
      ["Headmaster", 8475, null],
      ["Mr Mensah", 8475, null],
      ["Mrs Owusu", 8475, null],
    ]);
    const [tx] = await rows(ALICE, "select kind, amount_minor, category_id, note from public.transactions where id = $1", [
      shares[0].transaction_id,
    ]);
    expect(tx).toEqual({ kind: "income", amount_minor: 8475, category_id: income, note: "Morning classes: my share, week of 23 Oct 2026".replace("23", "19") });

    // Out on settling: school 99 + markers 25 + assistant 40 + my 84.75 (now my income).
    expect(await held()).toBe(59800 - 9900 - 2500 - 4000 - 8475);
    // Cash: the same money, my share now counted as income instead of held.
    expect(await balance()).toBe(10000 + 59800 - 9900 - 2500 - 4000);
  });

  it("other teachers' shares leave Cash when ticked as paid", async () => {
    const before = await balance();
    await rows(ALICE, "update public.mc_shares set paid_on = '2026-10-23' where name = 'Mr Mensah'");
    expect(await balance()).toBe(before - 8475);
    await expect(rows(ALICE, "update public.mc_shares set paid_on = null where is_me")).rejects.toThrow(/your own share/);
  });

  it("a settled week's days are locked, and it cannot be settled twice", async () => {
    await expect(rows(ALICE, "update public.mc_days set full_1 = 1 where day = '2026-10-19'")).rejects.toThrow(/settled/);
    await expect(rows(ALICE, "delete from public.mc_days where day = '2026-10-19'")).rejects.toThrow(/settled/);
    await expect(
      settle({ week: "2026-10-19", savings: 9500, markers: 2500, assistant: 4000, each: 8475, sharers: [me, mensah, owusu, head] }),
    ).rejects.toThrow(/duplicate/);
  });

  it("my share's income cannot be changed or deleted in Activity", async () => {
    const [{ id }] = await rows<{ id: string }>(ALICE, "select id from public.transactions");
    await expect(rows(ALICE, "update public.transactions set amount_minor = 1, amount_ghs_minor = 1, account_amount_minor = 1 where id = $1", [id])).rejects.toThrow(
      /School money/,
    );
    await expect(rows(ALICE, "delete from public.transactions where id = $1", [id])).rejects.toThrow(/mc_shares_transaction_id_fkey/);
  });

  it("the savings fund can be spent, but not beyond what it has", async () => {
    await rows(ALICE, "insert into public.school_fund_spends (fund, amount_minor, spent_on, purpose, note) values ('morning', 6000, '2026-10-24', 'sports', 'Sports day')");
    await expect(
      rows(ALICE, "insert into public.school_fund_spends (fund, amount_minor, spent_on, purpose) values ('morning', 3501, '2026-10-24', 'other')"),
    ).rejects.toThrow(/more than the fund has/);
    await expect(
      rows(ALICE, "insert into public.school_fund_spends (fund, amount_minor, spent_on, purpose) values ('books', 1, '2026-10-24', 'other')"),
    ).rejects.toThrow(/more than the fund has/);
  });

  it("unsettling unlocks the week and removes my income", async () => {
    const [{ id }] = await rows<{ id: string }>(ALICE, "select id from public.mc_weeks");
    // The spend from the savings fund must go first: the fund cannot go below 0.
    await rows(ALICE, "delete from public.school_fund_spends");
    await rows(ALICE, "select public.mc_unsettle($1)", [id]);
    expect(await rows(ALICE, "select id from public.mc_weeks")).toEqual([]);
    expect(await rows(ALICE, "select id from public.transactions")).toEqual([]);
    expect(await held()).toBe(59800);
    await rows(ALICE, "update public.mc_days set full_1 = 14 where day = '2026-10-19'");
  });

  it("a short week: three class days, half of Wednesday saved", async () => {
    await rows(ALICE, "delete from public.mc_days where day in ('2026-10-22', '2026-10-23')");
    await rows(ALICE, "insert into public.mc_days (day, no_class, reason) values ('2026-10-22', true, 'holiday'), ('2026-10-23', true, 'holiday')");
    await settle({
      week: "2026-10-19",
      rule: "half",
      day: "2026-10-21",
      savings: 5250,
      markers: 0,
      assistant: 2500,
      each: 5750,
      sharers: [me, mensah, owusu, head],
    });
    const [week] = await rows(ALICE, "select class_days, collected_minor, school_minor from public.mc_weeks");
    expect(week).toEqual({ class_days: 3, collected_minor: 36900, school_minor: 6150 });
  });

  it("is private: other users see nothing and cannot settle without set-up", async () => {
    expect(await rows(BOB, "select id from public.mc_days")).toEqual([]);
    expect(await rows(BOB, "select * from public.school_cash_moves")).toEqual([]);
    await expect(
      rows(BOB, "select public.mc_settle('2026-10-19', '2026-10-23', 'all', null, 0, 0, 0, 0, 0, $1)", [[me]]),
    ).rejects.toThrow(/set up School money first/);
    await expect(asAnon(db, () => db.query("select public.mc_unsettle($1)", [me]))).rejects.toThrow(/permission denied/);
    await expect(rows(BOB, "insert into public.mc_days (day) values ('2026-10-19')")).rejects.toThrow(/set up School money first/);
  });

  it("the account's currency is locked while it holds school money", async () => {
    await expect(rows(ALICE, "update public.accounts set currency = 'USD' where id = $1", [cash])).rejects.toThrow(/currency/);
  });
});

describe("Delete my account", () => {
  it("removes all School money rows with the user", async () => {
    await rows(ALICE, "select public.delete_my_account()");
    for (const table of ["school_settings", "mc_days", "mc_weeks", "mc_shares", "mc_sharers", "transactions"]) {
      expect((await db.query(`select count(*)::int as n from public.${table}`)).rows).toEqual([{ n: 0 }]);
    }
  });
});
