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

  it("refuses a signed-out visitor", async () => {
    await expect(asAnon(db, () => db.query("select public.delete_my_account()"))).rejects.toThrow(/permission denied/);
  });
});
