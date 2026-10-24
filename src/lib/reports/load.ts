import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { fetchAllPages } from "../pages";
import type { ReportInput } from "./build";
import { dataRange, type Period } from "./periods";

// Loads everything one report needs, for one user (DESIGN §7). Used by the
// Reports page (with the user's own client, where RLS also applies) and by
// the Monday email (with the daily job's secret-key client, where RLS does
// NOT apply). So every query here filters by user_id itself: never remove
// those filters. load.test.ts checks them with a client that has no RLS.
export async function loadReportInput(
  db: SupabaseClient<Database>,
  userId: string,
  period: Period,
  today: string,
): Promise<ReportInput> {
  const range = dataRange(period, today);
  const fail = (what: string, message: string) => new Error(`Could not load ${what}: ${message}`);

  const [transactions, categories, budgets, goals, first] = await Promise.all([
    fetchAllPages((from, to) =>
      db
        .from("transactions")
        .select("id, kind, occurred_on, category_id, amount_ghs_minor, note")
        .eq("user_id", userId)
        .gte("occurred_on", range.first)
        .lte("occurred_on", range.last)
        // A fixed order, so pages never overlap.
        .order("occurred_on")
        .order("created_at")
        .order("id")
        .range(from, to),
    ).catch((error: Error) => {
      throw fail("transactions", error.message);
    }),
    db.from("categories").select("id, kind, parent_id, name, system_key, sort_order, archived_at").eq("user_id", userId),
    db.from("budgets").select("category_id, effective_from, amount_minor").eq("user_id", userId),
    db
      .from("goals")
      .select("id, name, target_minor, target_date, archived_at, goal_contributions(occurred_on, amount_minor)")
      .eq("user_id", userId),
    db
      .from("transactions")
      .select("occurred_on")
      .eq("user_id", userId)
      .order("occurred_on")
      .limit(1)
      .maybeSingle(),
  ]);
  if (categories.error) throw fail("categories", categories.error.message);
  if (budgets.error) throw fail("budgets", budgets.error.message);
  if (goals.error) throw fail("goals", goals.error.message);
  if (first.error) throw fail("the first transaction", first.error.message);

  // The embedded contributions are typed by hand (Relationships: []).
  const goalRows = goals.data as unknown as {
    id: string;
    name: string;
    target_minor: number;
    target_date: string;
    archived_at: string | null;
    goal_contributions: { occurred_on: string; amount_minor: number }[];
  }[];

  return {
    period,
    today,
    transactions: transactions.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredOn: row.occurred_on,
      categoryId: row.category_id,
      amountGhsMinor: row.amount_ghs_minor,
      note: row.note,
    })),
    categories: categories.data.map((row) => ({
      id: row.id,
      kind: row.kind,
      parentId: row.parent_id,
      name: row.name,
      systemKey: row.system_key,
      sortOrder: row.sort_order,
      archived: row.archived_at !== null,
    })),
    budgets: budgets.data.map((row) => ({
      categoryId: row.category_id,
      effectiveFrom: row.effective_from,
      amountMinor: row.amount_minor,
    })),
    goals: goalRows.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetMinor: goal.target_minor,
      targetDate: goal.target_date,
      archived: goal.archived_at !== null,
      contributions: goal.goal_contributions.map((c) => ({ occurredOn: c.occurred_on, amountMinor: c.amount_minor })),
    })),
    historyStartsOn: first.data?.occurred_on ?? null,
  };
}
