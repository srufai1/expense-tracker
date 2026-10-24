import "server-only";

import { requireUser } from "@/lib/auth";
import type { BudgetRow } from "@/lib/budgets";
import { createClient } from "@/lib/supabase/server";

// Every budget row of the user (a few per category: one per change).
export async function getBudgetRows(): Promise<BudgetRow[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("category_id, effective_from, amount_minor")
    .order("effective_from");
  if (error) throw new Error(`Could not load budgets: ${error.message}`);
  return data.map((row) => ({ categoryId: row.category_id, effectiveFrom: row.effective_from, amountMinor: row.amount_minor }));
}
