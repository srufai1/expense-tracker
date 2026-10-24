import "server-only";

import type { StoredRate } from "@/lib/fx";
import type { Currency } from "@/lib/money";
import { planContributions, planRule, type RuleToRun } from "@/lib/recurring-run";
import type { createAdminClient } from "@/lib/supabase/admin";

// Task 2 of the daily job: create the due recurring items (DESIGN §6.6).
// The logic is planRule() (tested in src/lib); this only reads and writes.
// Running twice is safe: unique (recurring_rule_id, occurrence_date) means
// an occurrence that already exists is skipped, never doubled.
export async function runRecurring(supabase: ReturnType<typeof createAdminClient>, today: string): Promise<string> {
  const { data: rules, error } = await supabase
    .from("recurring_rules")
    .select(
      "id, user_id, kind, account_id, category_id, to_account_id, goal_id, amount_minor, currency, note, frequency, weekday, day_of_month, next_run_on, ends_on, paused",
    )
    .eq("paused", false)
    .lte("next_run_on", today);
  if (error) return `failed: could not read the recurring items: ${error.message}`;
  if (rules.length === 0) return "nothing due";

  const accountIds = [...new Set(rules.flatMap((rule) => [rule.account_id, rule.to_account_id]).filter(Boolean))];
  const goalIds = [...new Set(rules.map((rule) => rule.goal_id).filter(Boolean))];
  const [
    { data: accounts, error: accountsError },
    { data: rateRows, error: ratesError },
    { data: goals, error: goalsError },
  ] = await Promise.all([
    supabase.from("accounts").select("id, currency").in("id", accountIds as string[]),
    supabase.from("fx_rates").select("rate_date, rate").eq("base", "USD").eq("quote", "GHS"),
    supabase.from("goals").select("id, archived_at").in("id", goalIds as string[]),
  ]);
  if (accountsError || ratesError || goalsError) return `failed: could not read accounts, rates or goals`;
  const currencyOf = new Map<string, Currency>(accounts.map((account) => [account.id, account.currency]));
  const goalArchived = new Map(goals.map((goal) => [goal.id, goal.archived_at !== null]));
  const rates: StoredRate[] = rateRows.map((row) => ({ rateDate: row.rate_date, rate: row.rate.toFixed(6) }));

  let created = 0;
  const problems: string[] = [];
  // If this fails, the next run finds the same dates and skips them (unique).
  async function moveOn(id: string, from: string, to: string) {
    if (to === from) return;
    const { error: updateError } = await supabase.from("recurring_rules").update({ next_run_on: to }).eq("id", id);
    if (updateError) problems.push(`${id}: ${updateError.message}`);
  }
  for (const row of rules) {
    const rule: RuleToRun = {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      accountId: row.account_id,
      categoryId: row.category_id,
      toAccountId: row.to_account_id,
      goalId: row.goal_id,
      amountMinor: row.amount_minor,
      currency: row.currency,
      note: row.note,
      frequency: row.frequency,
      weekday: row.weekday,
      dayOfMonth: row.day_of_month,
      nextRunOn: row.next_run_on,
      endsOn: row.ends_on,
      paused: row.paused,
    };
    if (rule.kind === "goal_contribution") {
      // D-40: a contribution to a goal, not a transaction.
      const archived = goalArchived.get(rule.goalId ?? "");
      if (archived === undefined) {
        problems.push(`${rule.id}: goal not found`);
        continue;
      }
      const plan = planContributions(rule, archived, today);
      if (plan.error) problems.push(`${rule.id}: ${plan.error}`);
      if (plan.rows.length > 0) {
        const { error: insertError } = await supabase
          .from("goal_contributions")
          .upsert(plan.rows, { onConflict: "recurring_rule_id,occurrence_date", ignoreDuplicates: true });
        if (insertError) {
          problems.push(`${rule.id}: ${insertError.message}`);
          continue;
        }
        created += plan.rows.length;
      }
      // Moves on even for an archived goal: those dates pass (D-40).
      await moveOn(rule.id, rule.nextRunOn, plan.nextRunOn);
      continue;
    }

    const accountCurrency = rule.accountId ? currencyOf.get(rule.accountId) : undefined;
    if (!accountCurrency) {
      problems.push(`${rule.id}: account not found`);
      continue;
    }
    const plan = planRule(
      rule,
      accountCurrency,
      rule.toAccountId ? (currencyOf.get(rule.toAccountId) ?? null) : null,
      rates,
      today,
    );
    if (plan.error) problems.push(`${rule.id}: ${plan.error}`);
    if (plan.rows.length === 0) continue;

    const { error: insertError } = await supabase
      .from("transactions")
      .upsert(plan.rows, { onConflict: "recurring_rule_id,occurrence_date", ignoreDuplicates: true });
    if (insertError) {
      // Nothing moves on: the next run tries the same dates again.
      problems.push(`${rule.id}: ${insertError.message}`);
      continue;
    }
    await moveOn(rule.id, rule.nextRunOn, plan.nextRunOn);
    created += plan.rows.length;
  }

  const summary = `created ${created} item(s) from ${rules.length} due rule(s)`;
  return problems.length > 0 ? `failed: ${summary}; problems: ${problems.join("; ")}` : summary;
}
