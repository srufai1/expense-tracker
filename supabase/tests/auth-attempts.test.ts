import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb } from "./test-db";

// Five failed attempts lock for 20 minutes (D-49): sign-in per email, the
// invite code per network address, the current password per user.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')", [
    ALICE,
    BOB,
  ]);
});

afterAll(async () => {
  await db.close();
});

type Lock = { locked: string | null };
const failed = (kind: string, subject: string | null, who?: string) => {
  const run = () => db.query<Lock>("select public.auth_attempt_failed($1, $2) as locked", [kind, subject]);
  return (who ? asUser(db, who, run) : asAnon(db, run)).then((r) => r.rows[0].locked);
};
const lockedUntil = (kind: string, subject: string | null, who?: string) => {
  const run = () => db.query<Lock>("select public.auth_attempt_lock($1, $2) as locked", [kind, subject]);
  return (who ? asUser(db, who, run) : asAnon(db, run)).then((r) => r.rows[0].locked);
};
const cleared = (kind: string, who: string) =>
  asUser(db, who, () => db.query("select public.auth_attempt_cleared($1)", [kind]));
// Moves the stored times back, as if `minutes` had passed.
const timePasses = (minutes: number) =>
  db.query(
    `update public.auth_attempts set first_failed_at = first_failed_at - make_interval(mins => $1),
       locked_until = locked_until - make_interval(mins => $1)`,
    [minutes],
  );

describe("auth_attempt_failed / auth_attempt_lock", () => {
  it("locks sign-in for an email after the 5th failure, for 20 minutes", async () => {
    for (let i = 1; i <= 4; i++) expect(await failed("sign-in", "alice@example.com")).toBeNull();
    expect(await lockedUntil("sign-in", "alice@example.com")).toBeNull();
    const until = await failed("sign-in", "Alice@Example.com "); // the same email, typed differently
    expect(until).not.toBeNull();
    const minutes = (new Date(until!).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(19.9);
    expect(minutes).toBeLessThanOrEqual(20);
    expect(await lockedUntil("sign-in", "alice@example.com")).toEqual(until);
    // Other emails are not affected.
    expect(await lockedUntil("sign-in", "bob@example.com")).toBeNull();
  });

  it("unlocks after 20 minutes and starts counting again", async () => {
    await timePasses(21);
    expect(await lockedUntil("sign-in", "alice@example.com")).toBeNull();
    expect(await failed("sign-in", "alice@example.com")).toBeNull();
  });

  it("forgets failures older than 20 minutes", async () => {
    for (let i = 1; i <= 4; i++) await failed("sign-in", "carol@example.com");
    await timePasses(21);
    expect(await failed("sign-in", "carol@example.com")).toBeNull(); // counts as the 1st again
  });

  it("counts invite codes per network address", async () => {
    for (let i = 1; i <= 4; i++) expect(await failed("invite", "203.0.113.9")).toBeNull();
    expect(await failed("invite", "203.0.113.9")).not.toBeNull();
    expect(await lockedUntil("invite", "198.51.100.7")).toBeNull();
  });

  it("counts the current password per signed-in user, never for someone else", async () => {
    for (let i = 1; i <= 4; i++) expect(await failed("password", null, BOB)).toBeNull();
    expect(await failed("password", "ignored", BOB)).not.toBeNull();
    expect(await lockedUntil("password", null, BOB)).not.toBeNull();
    expect(await lockedUntil("password", null, ALICE)).toBeNull();
    await expect(failed("password", null)).rejects.toThrow(/not signed in/);
  });

  it("refuses unknown kinds and over-long subjects", async () => {
    await expect(failed("admin", "x")).rejects.toThrow(/unknown kind/);
    await expect(failed("sign-in", "a".repeat(300))).rejects.toThrow(/too long/);
  });
});

describe("auth_attempt_cleared", () => {
  it("lets a signed-in user clear only their own sign-in and password counters", async () => {
    for (let i = 1; i <= 3; i++) await failed("sign-in", "bob@example.com");
    await cleared("sign-in", BOB);
    await cleared("password", BOB);
    // Read as the database owner: the table is closed to every app role.
    const { rows } = await db.query<{ key: string }>("select key from public.auth_attempts order by key");
    expect(rows.map((r) => r.key)).not.toContain("sign-in:bob@example.com");
    expect(rows.map((r) => r.key)).not.toContain(`password:${BOB}`);
    expect(rows.map((r) => r.key)).toContain("invite:203.0.113.9");
  });

  it("cannot be used by a signed-out visitor, and the table is closed to everyone", async () => {
    await expect(asAnon(db, () => db.query("select public.auth_attempt_cleared('sign-in')"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(db, () => db.query("select * from public.auth_attempts"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ALICE, () => db.query("delete from public.auth_attempts"))).rejects.toThrow(
      /permission denied/,
    );
  });
});
