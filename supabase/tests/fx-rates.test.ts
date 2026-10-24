import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asServiceRole, asUser, createTestDb, createUser } from "./test-db";

// Exchange rates: shared reference data. Signed-in users only read them;
// only the daily job (secret key) writes them (DESIGN §6.4).

const ALICE = "00000000-0000-4000-8000-00000000000a";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
});

afterAll(async () => {
  await db.close();
});

const insertRate = (date: string, rate: string, base = "USD", quote = "GHS") =>
  db.query(
    "insert into public.fx_rates (rate_date, base, quote, rate, source) values ($1, $2, $3, $4, 'open.er-api.com')",
    [date, base, quote, rate],
  );

describe("fx_rates: who can do what", () => {
  it("lets the daily job store and update a rate", async () => {
    await asServiceRole(db, () => insertRate("2026-10-23", "11.6512"));
    await asServiceRole(db, () =>
      db.query(
        `insert into public.fx_rates (rate_date, base, quote, rate, source)
         values ('2026-10-23', 'USD', 'GHS', 11.671489, 'open.er-api.com')
         on conflict (rate_date, base, quote) do update set rate = excluded.rate, fetched_at = now()`,
      ),
    );
    const rows = await asUser(db, ALICE, () =>
      db.query<{ rate: string }>("select rate::text from public.fx_rates where rate_date = '2026-10-23'"),
    );
    expect(rows.rows).toEqual([{ rate: "11.671489" }]);
  });

  it("lets a signed-in user read but never write", async () => {
    await expect(asUser(db, ALICE, () => insertRate("2026-10-24", "12"))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ALICE, () => db.query("update public.fx_rates set rate = 1")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ALICE, () => db.query("delete from public.fx_rates")),
    ).rejects.toThrow(/permission denied/);
  });

  it("is hidden from signed-out visitors", async () => {
    await expect(asAnon(db, () => db.query("select * from public.fx_rates"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("fx_rates: shape", () => {
  it("needs a positive rate between two different known currencies", async () => {
    await expect(asServiceRole(db, () => insertRate("2026-10-25", "0"))).rejects.toThrow(/fx_rates_rate_positive/);
    await expect(asServiceRole(db, () => insertRate("2026-10-25", "1", "USD", "USD"))).rejects.toThrow(
      /fx_rates_currencies_valid/,
    );
    await expect(asServiceRole(db, () => insertRate("2026-10-25", "1", "EUR", "GHS"))).rejects.toThrow(
      /fx_rates_currencies_valid/,
    );
  });

  it("keeps one rate per day and currency pair", async () => {
    await asServiceRole(db, () => insertRate("2026-10-26", "11.7"));
    await expect(asServiceRole(db, () => insertRate("2026-10-26", "11.8"))).rejects.toThrow(/fx_rates_pkey/);
  });
});

describe("transactions: rate source and date (M-5)", () => {
  let account: string;
  let category: string;

  beforeAll(async () => {
    await asUser(db, ALICE, async () => {
      account = (
        await db.query<{ id: string }>(
          "insert into public.accounts (name, type, currency) values ('Card', 'card', 'GHS') returning id",
        )
      ).rows[0].id;
      category = (
        await db.query<{ id: string }>("insert into public.categories (kind, name) values ('expense', 'Subs') returning id")
      ).rows[0].id;
    });
  });

  const addUsd = (source: string, rateDate: string | null) =>
    asUser(db, ALICE, () =>
      db.query(
        `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency,
           fx_rate, fx_source, fx_rate_date, amount_ghs_minor, account_amount_minor)
         values ('expense', '2026-10-23', $1, $2, 999, 'USD', 15.4, $3, $4, 15385, 15385)`,
        [account, category, source, rateDate],
      ),
    );

  it("dates a fetched rate, and never a typed one", async () => {
    await expect(addUsd("auto", "2026-10-23")).resolves.toBeDefined();
    await expect(addUsd("manual", null)).resolves.toBeDefined();
    await expect(addUsd("auto", null)).rejects.toThrow(/transactions_auto_rate_dated/);
    await expect(addUsd("manual", "2026-10-23")).rejects.toThrow(/transactions_auto_rate_dated/);
  });
});
