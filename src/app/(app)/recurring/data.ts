import "server-only";

import { requireUser } from "@/lib/auth";
import type { Currency } from "@/lib/money";
import type { Frequency, RuleKind } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";

export type Rule = {
  id: string;
  kind: RuleKind;
  accountId: string;
  categoryId: string | null;
  toAccountId: string | null;
  amountMinor: number;
  currency: Currency;
  note: string;
  frequency: Frequency;
  weekday: number | null;
  dayOfMonth: number | null;
  startsOn: string;
  endsOn: string | null;
  nextRunOn: string;
  paused: boolean;
};

const COLUMNS =
  "id, kind, account_id, category_id, to_account_id, amount_minor, currency, note, frequency, weekday, day_of_month, starts_on, ends_on, next_run_on, paused";

type Row = {
  id: string;
  kind: RuleKind;
  account_id: string;
  category_id: string | null;
  to_account_id: string | null;
  amount_minor: number;
  currency: Currency;
  note: string;
  frequency: Frequency;
  weekday: number | null;
  day_of_month: number | null;
  starts_on: string;
  ends_on: string | null;
  next_run_on: string;
  paused: boolean;
};

function toRule(row: Row): Rule {
  return {
    id: row.id,
    kind: row.kind,
    accountId: row.account_id,
    categoryId: row.category_id,
    toAccountId: row.to_account_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    note: row.note,
    frequency: row.frequency,
    weekday: row.weekday,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    nextRunOn: row.next_run_on,
    paused: row.paused,
  };
}

// The user's recurring items, the next one due first.
export async function getRules(): Promise<Rule[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("recurring_rules").select(COLUMNS).order("next_run_on");
  if (error) throw new Error(`Could not load recurring items: ${error.message}`);
  return data.map(toRule);
}

// One recurring item, or null when it does not exist or is someone else's.
export async function getRule(id: string): Promise<Rule | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("recurring_rules").select(COLUMNS).eq("id", id).maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the recurring item: ${error.message}`);
  return data ? toRule(data) : null;
}
