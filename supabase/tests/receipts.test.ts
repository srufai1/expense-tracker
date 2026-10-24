import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb, createUser } from "./test-db";

// Receipt photos (DESIGN §6.9, D-10): a private bucket, one photo per
// transaction at {user_id}/{transaction_id}.jpg, reachable by its owner only.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
let aliceTx: string;
let bobTx: string;

async function rows<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await asUser(db, userId, () => db.query<T>(sql, params))).rows;
}

async function addTransaction(userId: string) {
  const [account] = await rows<{ id: string }>(
    userId,
    "insert into public.accounts (name, type, currency, opening_balance_on) values ('Cash', 'cash', 'GHS', '2026-10-01') returning id",
  );
  const [category] = await rows<{ id: string }>(
    userId,
    "insert into public.categories (kind, name) values ('expense', 'Receipt food') returning id",
  );
  const [tx] = await rows<{ id: string }>(
    userId,
    `insert into public.transactions (kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate,
       fx_source, amount_ghs_minor, account_amount_minor)
     values ('expense', '2026-10-20', $1, $2, 2500, 'GHS', 1, 'none', 2500, 2500) returning id`,
    [account.id, category.id],
  );
  return tx.id;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
  aliceTx = await addTransaction(ALICE);
  bobTx = await addTransaction(BOB);
});

afterAll(async () => {
  await db.close();
});

const upload = (userId: string, name: string, bucket = "receipts") =>
  rows(userId, "insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)", [bucket, name, userId]);

describe("the receipts bucket", () => {
  it("is private, for JPEG photos up to 5 MB", async () => {
    const [bucket] = await rows<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      ALICE,
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'receipts'",
    );
    expect(bucket).toEqual({ public: false, file_size_limit: 5_242_880, allowed_mime_types: ["image/jpeg"] });
  });
});

describe("receipt policies", () => {
  it("lets a user add a photo for their own transaction, in their own folder", async () => {
    await upload(ALICE, `${ALICE}/${aliceTx}.jpg`);
    expect(await rows(ALICE, "select name from storage.objects")).toEqual([{ name: `${ALICE}/${aliceTx}.jpg` }]);
  });

  it("refuses another user's folder, another user's transaction, unknown transactions and other names", async () => {
    await expect(upload(ALICE, `${BOB}/${bobTx}.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/${bobTx}.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/00000000-0000-4000-8000-000000000999.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/${aliceTx}.png`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/x/${aliceTx}.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ALICE, `${ALICE}/${aliceTx}.jpg`, "other")).rejects.toThrow(/row-level security|violates foreign key/);
  });

  it("keeps each user's photos private", async () => {
    expect(await rows(BOB, "select name from storage.objects")).toEqual([]);
    // Bob cannot delete or move Alice's photo.
    await rows(BOB, "delete from storage.objects where name = $1", [`${ALICE}/${aliceTx}.jpg`]);
    await rows(BOB, "update storage.objects set name = $2 where name = $1", [`${ALICE}/${aliceTx}.jpg`, `${BOB}/${bobTx}.jpg`]);
    expect(await rows(ALICE, "select name from storage.objects")).toEqual([{ name: `${ALICE}/${aliceTx}.jpg` }]);
  });

  it("lets the owner delete the photo, even after the transaction is gone", async () => {
    await rows(ALICE, "delete from public.transactions where id = $1", [aliceTx]);
    await rows(ALICE, "delete from storage.objects where name = $1", [`${ALICE}/${aliceTx}.jpg`]);
    expect(await rows(ALICE, "select name from storage.objects")).toEqual([]);
  });
});
