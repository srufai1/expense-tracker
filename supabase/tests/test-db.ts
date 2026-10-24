import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const SUPABASE_DIR = join(import.meta.dirname, "..");

// A fresh in-memory Postgres with the Supabase stub and every migration
// applied in order — the same files that run against the real project.
export async function createTestDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(SUPABASE_DIR, "tests", "supabase-stub.sql"), "utf8"));

  const migrationsDir = join(SUPABASE_DIR, "migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return db;
}

export async function createUser(db: PGlite, id: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
}

// Runs `fn` as a signed-in user, the way the Data API does: role
// `authenticated` with the user's id in the JWT. Always switches back.
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub");
  }
}

// Runs `fn` as a signed-out visitor (role `anon`).
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

// Runs `fn` with the secret key's role (`service_role`), like the daily job.
export async function asServiceRole<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
