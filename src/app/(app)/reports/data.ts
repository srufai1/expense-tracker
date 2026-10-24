import "server-only";

import { requireUser } from "@/lib/auth";
import { buildReport, type Report } from "@/lib/reports/build";
import { dataRange, type Period } from "@/lib/reports/periods";
import { createClient } from "@/lib/supabase/server";

import { getTransactionsBetween } from "../activity/data";
import { getBudgetRows } from "../budgets/data";
import { getCategories } from "../categories/data";
import { getGoals } from "../goals/data";

// The date of the user's first transaction, or null without any. An
// average needs history from before its first window (§7.2, D-41).
async function getHistoryStart(): Promise<string | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("occurred_on")
    .order("occurred_on")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the first transaction: ${error.message}`);
  return data?.occurred_on ?? null;
}

// One report (DESIGN §7): loads exactly the dates the engine needs and
// hands everything to buildReport(), the one place the numbers come from.
export async function getReport(period: Period, today: string): Promise<Report> {
  const range = dataRange(period, today);
  const [rows, categories, budgets, goals, historyStartsOn] = await Promise.all([
    getTransactionsBetween(range.first, range.last),
    getCategories(),
    getBudgetRows(),
    getGoals(),
    getHistoryStart(),
  ]);
  return buildReport({
    period,
    today,
    transactions: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredOn: row.occurred_on,
      categoryId: row.category_id,
      amountGhsMinor: row.amount_ghs_minor,
      note: row.note,
    })),
    categories,
    budgets,
    goals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetMinor: goal.targetMinor,
      targetDate: goal.targetDate,
      archived: goal.archived,
      contributions: goal.contributions.map((c) => ({ occurredOn: c.occurredOn, amountMinor: c.amountMinor })),
    })),
    historyStartsOn,
  });
}
