import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole, asUser, createTestDb, createUser } from "./test-db";

// Settings (weekly email on/off) and the weekly email log (DESIGN §6.8,
// D-17, D-27, D-34).

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
const service = <T>(sql: string, params: unknown[] = []) => asServiceRole(db, () => db.query<T>(sql, params));

const setWeekly = (userId: string, on: boolean) =>
  rows(
    userId,
    `insert into public.settings (weekly_email) values ($1)
     on conflict (user_id) do update set weekly_email = excluded.weekly_email`,
    [on],
  );

describe("settings", () => {
  it("is one private row per user, saved and changed by its owner", async () => {
    await setWeekly(ALICE, false);
    await setWeekly(ALICE, true);
    expect(await rows(ALICE, "select weekly_email from public.settings")).toEqual([{ weekly_email: true }]);
    expect(await rows(BOB, "select * from public.settings")).toEqual([]);
    // Bob cannot change Alice's row, nor write one for her.
    await rows(BOB, "update public.settings set weekly_email = false where user_id = $1", [ALICE]);
    expect(await rows(ALICE, "select weekly_email from public.settings")).toEqual([{ weekly_email: true }]);
    await expect(
      rows(BOB, "insert into public.settings (user_id, weekly_email) values ($1, false)", [ALICE]),
    ).rejects.toThrow(/permission denied/);
  });

  it("can be read by the daily job", async () => {
    const { rows: all } = await service<{ user_id: string }>("select user_id from public.settings");
    expect(all.map((r) => r.user_id)).toContain(ALICE);
  });
});

describe("report_emails (the log that stops a week being sent twice)", () => {
  const log = (userId: string, weekStart: string, status: string, sentAt: string | null, error = "") =>
    service(
      "insert into public.report_emails (user_id, week_start, status, sent_at, error) values ($1, $2, $3, $4, $5)",
      [userId, weekStart, status, sentAt, error],
    );

  it("has one row per user and week, written by the daily job only", async () => {
    await log(ALICE, "2026-10-19", "sent", "2026-10-26T07:01:00Z");
    await expect(log(ALICE, "2026-10-19", "sent", "2026-10-26T07:02:00Z")).rejects.toThrow(/report_emails_pkey/);
    await log(BOB, "2026-10-19", "failed", null, "Resend answered 422.");
    await expect(
      rows(ALICE, "insert into public.report_emails (user_id, week_start, status) values ($1, '2026-10-12', 'sent')", [ALICE]),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets each user read only their own log", async () => {
    expect(await rows(ALICE, "select week_start::text, status from public.report_emails")).toEqual([
      { week_start: "2026-10-19", status: "sent" },
    ]);
  });

  it("checks the week, the status and the sent time", async () => {
    // A week starts on a Monday (D-14).
    await expect(log(ALICE, "2026-10-20", "sent", "2026-10-26T07:00:00Z")).rejects.toThrow(/report_emails_week_monday/);
    await expect(log(ALICE, "2026-10-05", "lost", null)).rejects.toThrow(/report_emails_status_valid/);
    // "sent" has a time; "failed" does not.
    await expect(log(ALICE, "2026-10-05", "sent", null)).rejects.toThrow(/report_emails_sent_at/);
    await expect(log(ALICE, "2026-10-05", "failed", "2026-10-06T07:00:00Z")).rejects.toThrow(/report_emails_sent_at/);
  });

  it("lets the daily job turn a failed week into a sent one", async () => {
    await service(
      "update public.report_emails set status = 'sent', sent_at = now(), error = '' where user_id = $1 and week_start = '2026-10-19'",
      [BOB],
    );
    const { rows: bob } = await service<{ status: string }>(
      "select status from public.report_emails where user_id = $1",
      [BOB],
    );
    expect(bob).toEqual([{ status: "sent" }]);
  });
});

describe("the daily job's reads for a report", () => {
  it("can read budgets (the other report tables were granted earlier)", async () => {
    await expect(service("select * from public.budgets")).resolves.toBeDefined();
  });
});
