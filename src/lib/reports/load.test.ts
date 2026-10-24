import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { loadReportInput } from "./load";
import { periodFor } from "./periods";

type Row = Record<string, unknown>;

// A fake Supabase client over in-memory tables. Like the daily job's
// secret-key client it has NO Row-Level Security: it returns every user's
// rows unless the query filters them. It applies eq / gte / lte / order /
// limit / range like PostgREST, and records each query.
function fakeDb(tables: Record<string, Row[]>, cap = 1000, failing?: string) {
  const queries: { table: string; filters: string[] }[] = [];
  const client = {
    from(table: string) {
      const query = { table, filters: [] as string[] };
      queries.push(query);
      let rows = [...(tables[table] ?? [])];
      let slice: [number, number] = [0, cap - 1];
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          query.filters.push(`${column}=${String(value)}`);
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        gte(column: string, value: string) {
          rows = rows.filter((row) => String(row[column]) >= value);
          return builder;
        },
        lte(column: string, value: string) {
          rows = rows.filter((row) => String(row[column]) <= value);
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          const direction = options?.ascending === false ? -1 : 1;
          rows.sort((a, b) => (String(a[column]) < String(b[column]) ? -direction : String(a[column]) > String(b[column]) ? direction : 0));
          return builder;
        },
        limit(count: number) {
          slice = [0, count - 1];
          return builder;
        },
        range(from: number, to: number) {
          slice = [from, Math.min(to, from + cap - 1)];
          return builder;
        },
        // failing = "first" breaks only the one-row query (the history start).
        maybeSingle: async () =>
          table === failing || failing === "first"
            ? { data: null, error: { message: "boom" } }
            : { data: rows[0] ?? null, error: null },
        then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => void) {
          resolve(
            table === failing
              ? { data: null, error: { message: "boom" } }
              : { data: rows.slice(slice[0], slice[1] + 1), error: null },
          );
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, queries };
}

const ALICE = "alice";
const BOB = "bob";

const category = (user_id: string, id: string, name: string, extra: Row = {}) => ({
  user_id,
  id,
  kind: "expense",
  parent_id: null,
  name,
  system_key: null,
  sort_order: 0,
  archived_at: null,
  ...extra,
});
const tx = (user_id: string, id: string, occurred_on: string, amount: number, extra: Row = {}) => ({
  user_id,
  id,
  kind: "expense",
  occurred_on,
  created_at: `${occurred_on}T08:00:00Z`,
  category_id: user_id === ALICE ? "food" : "b-food",
  amount_ghs_minor: amount,
  note: "",
  ...extra,
});

const TABLES = {
  categories: [category(ALICE, "food", "Food"), category(BOB, "b-food", "Bob food")],
  transactions: [
    tx(ALICE, "a1", "2026-10-20", 2_500, { note: "Waakye" }),
    tx(ALICE, "a0", "2026-09-30", 1_000),
    tx(BOB, "b1", "2026-10-20", 99_900),
    tx(BOB, "b0", "2026-01-01", 5),
  ],
  budgets: [
    { user_id: ALICE, category_id: "food", effective_from: "2026-10-01", amount_minor: 10_000 },
    { user_id: BOB, category_id: "b-food", effective_from: "2026-10-01", amount_minor: 1 },
  ],
  goals: [
    {
      user_id: ALICE,
      id: "g",
      name: "Trip",
      target_minor: 100_000,
      target_date: "2026-12-31",
      archived_at: null,
      goal_contributions: [{ occurred_on: "2026-10-01", amount_minor: 5_000 }],
    },
    { user_id: BOB, id: "bg", name: "Bob goal", target_minor: 1, target_date: "2026-12-31", archived_at: null, goal_contributions: [] },
  ],
};

describe("loadReportInput", () => {
  it("loads only that user's rows, even with a client that has no RLS", async () => {
    const { client, queries } = fakeDb(TABLES);
    const input = await loadReportInput(client, ALICE, periodFor("week", "2026-10-19"), "2026-10-26");

    expect(input.transactions.map((t) => t.id)).toEqual(["a0", "a1"]);
    expect(input.transactions[1]).toEqual({
      id: "a1",
      kind: "expense",
      occurredOn: "2026-10-20",
      categoryId: "food",
      amountGhsMinor: 2_500,
      note: "Waakye",
    });
    expect(input.categories).toEqual([
      { id: "food", kind: "expense", parentId: null, name: "Food", systemKey: null, sortOrder: 0, archived: false },
    ]);
    expect(input.budgets).toEqual([{ categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 10_000 }]);
    expect(input.goals).toEqual([
      {
        id: "g",
        name: "Trip",
        targetMinor: 100_000,
        targetDate: "2026-12-31",
        archived: false,
        contributions: [{ occurredOn: "2026-10-01", amountMinor: 5_000 }],
      },
    ]);
    // Bob's first transaction (1 Jan) is not Alice's history.
    expect(input.historyStartsOn).toBe("2026-09-30");

    // Every query was filtered by the user.
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query.filters).toContain(`user_id=${ALICE}`);
  });

  it("reads every transaction past the 1,000-row page limit", async () => {
    const many = Array.from({ length: 1_500 }, (_, i) => tx(ALICE, `m${i}`, "2026-10-21", 1));
    const { client } = fakeDb({ ...TABLES, transactions: many });
    const input = await loadReportInput(client, ALICE, periodFor("week", "2026-10-19"), "2026-10-26");
    expect(input.transactions).toHaveLength(1_500);
  });

  it("has no history for a user without transactions", async () => {
    const { client } = fakeDb({ ...TABLES, transactions: [] });
    expect((await loadReportInput(client, ALICE, periodFor("week", "2026-10-19"), "2026-10-26")).historyStartsOn).toBeNull();
  });

  it.each([
    ["categories", "categories"],
    ["budgets", "budgets"],
    ["goals", "goals"],
    ["first", "the first transaction"],
  ])("says what failed: %s", async (failing, what) => {
    const { client } = fakeDb(TABLES, 1000, failing);
    await expect(loadReportInput(client, ALICE, periodFor("week", "2026-10-19"), "2026-10-26")).rejects.toThrow(
      `Could not load ${what}: boom`,
    );
  });

  it("throws a database error with the table's name", async () => {
    const failing = {
      from: () => {
        const builder: Record<string, unknown> = {};
        for (const name of ["select", "eq", "gte", "lte", "order", "limit", "range"]) builder[name] = () => builder;
        builder.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
        builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: { message: "boom" } });
        return builder;
      },
    } as unknown as SupabaseClient<Database>;
    await expect(loadReportInput(failing, ALICE, periodFor("week", "2026-10-19"), "2026-10-26")).rejects.toThrow(
      /Could not load .*: boom/,
    );
  });
});
