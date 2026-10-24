import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser } from "./test-db";

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

type Category = { id: string; name: string; kind: string; parent_id: string | null; system_key: string | null };

async function seed(userId: string) {
  await asUser(db, userId, () => db.query("select public.seed_starter_categories()"));
}

async function categories(userId: string) {
  const result = await asUser(db, userId, () =>
    db.query<Category>("select id, name, kind, parent_id, system_key from public.categories order by sort_order, name"),
  );
  return result.rows;
}

async function add(userId: string, values: { name: string; kind?: string; parentId?: string | null }) {
  const result = await asUser(db, userId, () =>
    db.query<Category>(
      "insert into public.categories (kind, parent_id, name) values ($1, $2, $3) returning *",
      [values.kind ?? "expense", values.parentId ?? null, values.name],
    ),
  );
  return result.rows[0];
}

const byName = (rows: Category[], name: string) => rows.find((row) => row.name === name)!;

describe("seed_starter_categories", () => {
  it("creates the starter list once, with Fees & Charges as the system category", async () => {
    await seed(ALICE);
    const rows = await categories(ALICE);
    const fees = byName(rows, "Fees & Charges");
    expect(fees.system_key).toBe("fees");
    expect(fees.parent_id).toBeNull();
    expect(byName(rows, "Groceries").parent_id).toBe(byName(rows, "Food").id);
    expect(byName(rows, "Salary").kind).toBe("income");
    // 14 top-level expense + 12 sub + 2 income + Fees & Charges
    expect(rows).toHaveLength(29);

    await seed(ALICE);
    expect(await categories(ALICE)).toHaveLength(29);
  });

  it("puts Fees & Charges back for a user who already has categories", async () => {
    await add(BOB, { name: "My own" });
    await seed(BOB);
    const rows = await categories(BOB);
    expect(rows.map((row) => row.name).sort()).toEqual(["Fees & Charges", "My own"]);
  });

  it("is not available to signed-out visitors", async () => {
    await expect(asAnon(db, () => db.query("select public.seed_starter_categories()"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("categories: ownership", () => {
  it("never shows one user's categories to another", async () => {
    const bobs = await categories(BOB);
    expect(bobs.some((row) => row.name === "Groceries")).toBe(false);
  });

  it("does not let a user attach a sub-category to someone else's category", async () => {
    const food = byName(await categories(ALICE), "Food");
    await expect(add(BOB, { name: "Sneaky", parentId: food.id })).rejects.toThrow(/parent category not found/);
  });

  it("does not let the app set or change the system key", async () => {
    await expect(
      asUser(db, ALICE, () =>
        db.query("insert into public.categories (kind, name, system_key) values ('expense', 'X', 'fees')"),
      ),
    ).rejects.toThrow(/permission denied/);
    const fees = byName(await categories(ALICE), "Fees & Charges");
    await expect(
      asUser(db, ALICE, () => db.query("update public.categories set system_key = null where id = $1", [fees.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let the app change a category's kind", async () => {
    const food = byName(await categories(ALICE), "Food");
    await expect(
      asUser(db, ALICE, () => db.query("update public.categories set kind = 'income' where id = $1", [food.id])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("categories: two levels", () => {
  it("refuses a third level", async () => {
    const groceries = byName(await categories(ALICE), "Groceries");
    await expect(add(ALICE, { name: "Vegetables", parentId: groceries.id })).rejects.toThrow(
      /only two levels/,
    );
  });

  it("refuses a sub-category of another kind", async () => {
    const salary = byName(await categories(ALICE), "Salary");
    await expect(add(ALICE, { name: "Lunch", kind: "expense", parentId: salary.id })).rejects.toThrow(
      /same kind/,
    );
  });

  it("refuses to move a category that has sub-categories under another one", async () => {
    const rows = await categories(ALICE);
    await expect(
      asUser(db, ALICE, () =>
        db.query("update public.categories set parent_id = $1 where id = $2", [
          byName(rows, "Housing").id,
          byName(rows, "Food").id,
        ]),
      ),
    ).rejects.toThrow(/cannot become a sub-category/);
  });

  it("refuses a category as its own parent", async () => {
    const health = byName(await categories(ALICE), "Health");
    await expect(
      asUser(db, ALICE, () =>
        db.query("update public.categories set parent_id = id where id = $1", [health.id]),
      ),
    ).rejects.toThrow(/categories_not_own_parent|only two levels|cannot become/);
  });
});

describe("categories: names", () => {
  it("refuses the same name twice under one parent, ignoring case", async () => {
    await expect(add(ALICE, { name: "FOOD" })).rejects.toThrow(/categories_user_kind_parent_name_key/);
    const food = byName(await categories(ALICE), "Food");
    await expect(add(ALICE, { name: "groceries", parentId: food.id })).rejects.toThrow(
      /categories_user_kind_parent_name_key/,
    );
  });

  it("allows the same name under different parents, and for income vs expense", async () => {
    const rows = await categories(ALICE);
    const repairs = await add(ALICE, { name: "Repairs", parentId: byName(rows, "Transport").id });
    expect(repairs.name).toBe("Repairs");
    const gifts = await add(ALICE, { name: "Gifts given", kind: "income" });
    expect(gifts.kind).toBe("income");
  });

  it("rejects empty, untrimmed or too-long names", async () => {
    await expect(add(ALICE, { name: "" })).rejects.toThrow(/categories_name_length/);
    await expect(add(ALICE, { name: " Snacks" })).rejects.toThrow(/categories_name_trimmed/);
    await expect(add(ALICE, { name: "x".repeat(41) })).rejects.toThrow(/categories_name_length/);
  });
});

describe("categories: archive and delete (D-32)", () => {
  it("never deletes or archives Fees & Charges", async () => {
    const fees = byName(await categories(ALICE), "Fees & Charges");
    await expect(
      asUser(db, ALICE, () => db.query("delete from public.categories where id = $1", [fees.id])),
    ).rejects.toThrow(/system category/);
    await expect(
      asUser(db, ALICE, () =>
        db.query("update public.categories set archived_at = now() where id = $1", [fees.id]),
      ),
    ).rejects.toThrow(/categories_system_not_archived/);
  });

  it("refuses to delete a category that still has sub-categories", async () => {
    const utilities = byName(await categories(ALICE), "Utilities");
    await expect(
      asUser(db, ALICE, () => db.query("delete from public.categories where id = $1", [utilities.id])),
    ).rejects.toThrow(/foreign key constraint/);
  });

  it("deletes an unused category", async () => {
    const snacks = await add(ALICE, { name: "Snacks" });
    const deleted = await asUser(db, ALICE, () =>
      db.query("delete from public.categories where id = $1", [snacks.id]),
    );
    expect(deleted.affectedRows).toBe(1);
  });
});
