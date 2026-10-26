import "server-only";

import { requireUser } from "@/lib/auth";
import { categoryPath } from "@/lib/categories";
import { exportTransactions, type BackupData, type TransactionRowForExport } from "@/lib/export/sheets";
import { fetchAllPages } from "@/lib/pages";
import { describeSchedule } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";

import { getAccounts } from "../accounts/data";
import { getBudgetRows } from "../budgets/data";
import { getCategories } from "../categories/data";
import { getGoals } from "../goals/data";
import { getRules } from "../recurring/data";
import { getSchoolBackup } from "../school/data";

const COLUMNS =
  "id, kind, occurred_on, account_id, category_id, to_account_id, amount_minor, currency, fx_rate, amount_ghs_minor, account_amount_minor, to_amount_minor, note";

// The user's transactions for an export, between two dates or all of them.
// Read page by page: the backup must never stop at 1,000 rows.
async function getRows(range?: { first: string; last: string }): Promise<TransactionRowForExport[]> {
  await requireUser();
  const supabase = await createClient();
  try {
    return await fetchAllPages((from, to) => {
      let query = supabase.from("transactions").select(COLUMNS);
      if (range) query = query.gte("occurred_on", range.first).lte("occurred_on", range.last);
      // id last, so the order is fixed and pages never overlap.
      return query.order("occurred_on").order("created_at").order("id").range(from, to);
    });
  } catch (error) {
    throw new Error(`Could not load transactions: ${(error as Error).message}`);
  }
}

// The period's transactions with names, for the report workbook.
export async function getExportTransactions(range: { first: string; last: string }) {
  const [rows, accounts, categories] = await Promise.all([getRows(range), getAccounts(), getCategories()]);
  return exportTransactions(rows, accounts, categories);
}

// Everything, for "Export everything" (the backup).
export async function getBackupData(): Promise<BackupData> {
  const [rows, accounts, categories, budgets, goals, rules, school] = await Promise.all([
    getRows(),
    getAccounts(),
    getCategories(),
    getBudgetRows(),
    getGoals(),
    getRules(),
    getSchoolBackup(),
  ]);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const goalName = new Map(goals.map((goal) => [goal.id, goal.name]));
  return {
    accounts,
    categories,
    school,
    transactions: exportTransactions(rows, accounts, categories),
    budgets,
    goals,
    recurring: rules.map((rule) => ({
      what:
        rule.kind === "transfer"
          ? `${accountName.get(rule.accountId ?? "") ?? ""} → ${accountName.get(rule.toAccountId ?? "") ?? ""}`
          : rule.kind === "goal_contribution"
            ? `To ${goalName.get(rule.goalId ?? "") ?? "a goal"}`
            : categoryPath(categories, rule.categoryId ?? ""),
      kind: rule.kind,
      amountMinor: rule.amountMinor,
      currency: rule.currency,
      schedule: describeSchedule(rule),
      startsOn: rule.startsOn,
      endsOn: rule.endsOn,
      nextRunOn: rule.nextRunOn,
      paused: rule.paused,
      note: rule.note,
    })),
  };
}
