import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser } from "./test-db";

// School fees (D-55) and past questions books (D-56).

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
let cash: string;
let income: string;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
  cash = await one(ALICE, "insert into public.accounts (name, type, currency, opening_balance_on) values ('Cash', 'cash', 'GHS', '2026-10-01') returning id");
  income = await one(ALICE, "insert into public.categories (kind, name) values ('income', 'School money') returning id");
  await rows(ALICE, "insert into public.school_settings (account_id, income_category_id) values ($1, $2)", [cash, income]);
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

async function num(userId: string, sql: string, params: unknown[] = []): Promise<number> {
  const [row] = await rows<{ n: number | string | null }>(userId, sql, params);
  return Number(row.n ?? 0);
}

const balance = () => num(ALICE, "select balance_minor as n from public.account_balances where account_id = $1", [cash]);
const heldFor = (source: string) => num(ALICE, "select sum(amount_minor) as n from public.school_cash_moves where source = $1", [source]);
const incomeTotal = () => num(ALICE, "select sum(amount_minor) as n from public.transactions where kind = 'income'");

const student = (name: string, className = "JHS 3") =>
  one(ALICE, "insert into public.school_students (name, class_name) values ($1, $2) returning id", [name, className]);

describe("fees", () => {
  let fee: string;
  let ama: string;
  let kofi: string;
  let yaw: string;

  it("students on a fee, each with what they pay (0 = full discount)", async () => {
    fee = await one(ALICE, "insert into public.school_fees (name, amount_minor) values ('Mock 1 fees', 15000) returning id");
    ama = await one(ALICE, "insert into public.school_fee_students (fee_id, student_id, payable_minor) values ($1, $2, 15000) returning id", [fee, await student("Ama Owusu")]);
    kofi = await one(ALICE, "insert into public.school_fee_students (fee_id, student_id, payable_minor) values ($1, $2, 15000) returning id", [fee, await student("Kofi Asante")]);
    yaw = await one(ALICE, "insert into public.school_fee_students (fee_id, student_id, payable_minor) values ($1, $2, 0) returning id", [fee, await student("Yaw Boateng")]);
    await expect(student("ama owusu", "jhs 3")).rejects.toThrow(/duplicate/);
    expect(yaw).toBeTruthy();
  });

  it("payments are held in Cash, not income", async () => {
    await rows(ALICE, "insert into public.school_fee_payments (fee_student_id, amount_minor, paid_on) values ($1, 15000, '2026-10-20'), ($2, 10000, '2026-10-21')", [ama, kofi]);
    expect(await heldFor("fee")).toBe(25000);
    expect(await balance()).toBe(25000);
    expect(await incomeTotal()).toBe(0);
    expect(await num(ALICE, "select public.school_fee_held($1) as n", [fee])).toBe(25000);
  });

  it("hands over to the headmaster (money leaves Cash) and to myself (it becomes income)", async () => {
    await rows(ALICE, "select public.school_hand_over($1, 'headmaster', 20000, '2026-10-22', ' Signed by Mr Mensah ')", [fee]);
    expect(await balance()).toBe(5000);
    await expect(rows(ALICE, "select public.school_hand_over($1, 'bursar', 5001, '2026-10-22', '')", [fee])).rejects.toThrow(/more than you are holding/);
    await rows(ALICE, "select public.school_hand_over($1, 'myself', 3000, '2026-10-22', '')", [fee]);
    // The 30.00 stays in Cash but is now my income, not school money.
    expect(await balance()).toBe(5000);
    expect(await heldFor("fee")).toBe(2000);
    expect(await incomeTotal()).toBe(3000);
    const [h] = await rows(ALICE, "select note from public.school_handovers where to_whom = 'headmaster'");
    expect(h).toEqual({ note: "Signed by Mr Mensah" });
  });

  it("a payment already handed over cannot be deleted; an undone hand-over removes its income", async () => {
    await expect(rows(ALICE, "delete from public.school_fee_payments where fee_student_id = $1", [ama])).rejects.toThrow(/already handed over/);
    const [{ id }] = await rows<{ id: string }>(ALICE, "select id from public.school_handovers where to_whom = 'myself'");
    const [{ transaction_id }] = await rows<{ transaction_id: string }>(ALICE, "select transaction_id from public.school_handovers where id = $1", [id]);
    await expect(rows(ALICE, "delete from public.transactions where id = $1", [transaction_id])).rejects.toThrow(/school_handovers_transaction_id_fkey/);
    await rows(ALICE, "select public.school_undo_handover($1)", [id]);
    expect(await incomeTotal()).toBe(0);
    expect(await heldFor("fee")).toBe(5000);
  });

  it("another user cannot pay into, hand over from or see Alice's fee", async () => {
    await expect(rows(BOB, "insert into public.school_fee_payments (fee_student_id, amount_minor, paid_on) values ($1, 100, '2026-10-20')", [ama])).rejects.toThrow();
    await expect(rows(BOB, "select public.school_hand_over($1, 'headmaster', 1, '2026-10-22', '')", [fee])).rejects.toThrow(/set up School money first|fee not found/);
    expect(await rows(BOB, "select id from public.school_fees")).toEqual([]);
  });
});

describe("past questions books", () => {
  let maths: string;
  let english: string;
  let ama: string;
  let kwame: string;
  let amaMaths: string;
  let amaEnglish: string;

  it("money for books is held until they are given out", async () => {
    maths = await one(ALICE, "insert into public.book_subjects (name, price_minor) values ('Mathematics', 8000) returning id");
    english = await one(ALICE, "insert into public.book_subjects (name, price_minor) values ('English', 8000) returning id");
    ama = await student("Ama B.");
    kwame = await student("Kwame D.");
    amaMaths = await one(ALICE, "insert into public.book_orders (student_id, subject_id, price_minor) values ($1, $2, 8000) returning id", [ama, maths]);
    amaEnglish = await one(ALICE, "insert into public.book_orders (student_id, subject_id, price_minor) values ($1, $2, 8000) returning id", [ama, english]);
    await rows(ALICE, "insert into public.book_payments (student_id, amount_minor, paid_on) values ($1, 16000, '2026-10-20')", [ama]);
    expect(await heldFor("books")).toBe(16000);
  });

  it("cannot give out a book that was not bought yet", async () => {
    await expect(rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[amaMaths]])).rejects.toThrow(/no Mathematics books left/);
  });

  it("gives out at 45.00 a copy: 5 transport, 20 mine, 10 teachers", async () => {
    // 1 Maths book for 45.00, then 2 more for 100.00 (50.00 each).
    await rows(ALICE, "insert into public.book_purchases (subject_id, quantity, amount_minor, bought_on) values ($1, 1, 4500, '2026-10-21')", [maths]);
    await rows(ALICE, "insert into public.book_purchases (subject_id, quantity, amount_minor, bought_on) values ($1, 2, 10000, '2026-10-22')", [maths]);
    await rows(ALICE, "insert into public.book_purchases (subject_id, quantity, amount_minor, bought_on) values ($1, 1, 4500, '2026-10-22')", [english]);
    expect(await heldFor("books")).toBe(16000 - 4500 - 10000 - 4500);

    await rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[amaMaths, amaEnglish]]);
    const given = await rows(ALICE, "select cost_minor, transport_minor, mine_minor, teachers_minor from public.book_orders where student_id = $1 order by subject_id = $2", [ama, maths]);
    expect(given).toEqual([
      { cost_minor: 4500, transport_minor: 500, mine_minor: 2000, teachers_minor: 1000 },
      { cost_minor: 4500, transport_minor: 500, mine_minor: 2000, teachers_minor: 1000 },
    ]);
    expect(await incomeTotal()).toBe(4000);
    expect(await num(ALICE, "select public.school_fund_balance($1, 'books') as n", [ALICE]).catch(() => -1)).toBe(-1); // not callable by the app
    // Held for books: 160 paid − 190 spent on books − 2 × (5 transport + 20 mine).
    expect(await heldFor("books")).toBe(16000 - 19000 - 5000);
    await expect(rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[amaMaths]])).rejects.toThrow(/already given out/);
  });

  it("refuses books not yet paid for", async () => {
    const kwameMaths = await one(ALICE, "insert into public.book_orders (student_id, subject_id, price_minor) values ($1, $2, 8000) returning id", [kwame, maths]);
    await rows(ALICE, "insert into public.book_payments (student_id, amount_minor, paid_on) values ($1, 5000, '2026-10-20')", [kwame]);
    await expect(rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[kwameMaths]])).rejects.toThrow(/not paid/);
    await rows(ALICE, "insert into public.book_payments (student_id, amount_minor, paid_on) values ($1, 3000, '2026-10-21')", [kwame]);

    // The next Maths copy came from the 50.00 purchase: the teachers get 5.
    await rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[kwameMaths]]);
    const [order] = await rows(ALICE, "select cost_minor, mine_minor, teachers_minor from public.book_orders where id = $1", [kwameMaths]);
    expect(order).toEqual({ cost_minor: 5000, mine_minor: 2000, teachers_minor: 500 });
  });

  it("a book dearer than 55.00 takes from my part once the teachers' part is 0", async () => {
    const science = await one(ALICE, "insert into public.book_subjects (name, price_minor) values ('Science', 8000) returning id");
    await rows(ALICE, "insert into public.book_purchases (subject_id, quantity, amount_minor, bought_on) values ($1, 1, 5800, '2026-10-22')", [science]);
    const order = await one(ALICE, "insert into public.book_orders (student_id, subject_id, price_minor) values ($1, $2, 8000) returning id", [kwame, science]);
    await rows(ALICE, "insert into public.book_payments (student_id, amount_minor, paid_on) values ($1, 8000, '2026-10-22')", [kwame]);
    await rows(ALICE, "select public.books_give_out($1, '2026-10-26')", [[order]]);
    const [split] = await rows(ALICE, "select cost_minor, transport_minor, mine_minor, teachers_minor from public.book_orders where id = $1", [order]);
    expect(split).toEqual({ cost_minor: 5800, transport_minor: 500, mine_minor: 1700, teachers_minor: 0 });
  });

  it("the teachers' book fund holds the teachers' part and is spent separately", async () => {
    // Ama 10 + 10, Kwame 5 + 0 = 25.00.
    await expect(
      rows(ALICE, "insert into public.school_fund_spends (fund, amount_minor, spent_on, purpose) values ('books', 2501, '2026-10-26', 'teacher_books')"),
    ).rejects.toThrow(/more than the fund has/);
    await rows(ALICE, "insert into public.school_fund_spends (fund, amount_minor, spent_on, purpose) values ('books', 2500, '2026-10-26', 'teacher_books')");
  });

  it("protects given-out books: no delete, undo only the last of a subject, purchases used stay", async () => {
    await expect(rows(ALICE, "delete from public.book_orders where id = $1", [amaMaths])).rejects.toThrow(/given out/);
    await expect(rows(ALICE, "select public.books_undo_give($1)", [amaMaths])).rejects.toThrow(/only the last book/);
    await expect(rows(ALICE, "delete from public.book_purchases where subject_id = $1 and quantity = 1", [maths])).rejects.toThrow(/given out/);
    await expect(rows(ALICE, "delete from public.book_payments where student_id = $1", [ama])).rejects.toThrow(/already given out/);
  });

  it("undoing the last give-out removes its income", async () => {
    await rows(ALICE, "delete from public.school_fund_spends where fund = 'books'");
    const before = await incomeTotal();
    await rows(ALICE, "select public.books_undo_give($1)", [amaEnglish]);
    expect(await incomeTotal()).toBe(before - 2000);
    const [order] = await rows(ALICE, "select given_on, transaction_id from public.book_orders where id = $1", [amaEnglish]);
    expect(order).toEqual({ given_on: null, transaction_id: null });
  });

  it("Delete my account removes fees and books too", async () => {
    await rows(ALICE, "select public.delete_my_account()");
    for (const table of ["school_students", "school_fees", "school_fee_payments", "school_handovers", "book_subjects", "book_orders", "book_payments", "book_purchases", "transactions"]) {
      expect((await db.query(`select count(*)::int as n from public.${table}`)).rows).toEqual([{ n: 0 }]);
    }
  });
});
