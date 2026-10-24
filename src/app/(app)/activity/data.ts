import "server-only";

import { requireUser } from "@/lib/auth";
import type { CategoryRow } from "@/lib/categories";
import { categoryPath } from "@/lib/categories";
import type { Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { ActivityItem, EntryKind } from "@/lib/transactions";

import type { Account } from "../accounts/data";

export type Transaction = {
  id: string;
  kind: EntryKind;
  occurredOn: string;
  accountId: string;
  categoryId: string;
  amountMinor: number;
  currency: Currency;
  // GHS for 1 USD as stored with the row (M-2), "1" for GHS.
  rate: string;
  rateSource: "none" | "auto" | "manual";
  accountAmountMinor: number;
  note: string;
};

const COLUMNS = "id, kind, occurred_on, account_id, category_id, amount_minor, currency, amount_ghs_minor, note";

// The expense and income of one period, newest first. Transfers are added
// in build step 6.
export async function getTransactionsBetween(first: string, last: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .in("kind", ["expense", "income"])
    .gte("occurred_on", first)
    .lte("occurred_on", last)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load transactions: ${error.message}`);
  return data;
}

// Rows from getTransactionsBetween with the names the list shows.
export function toActivityItems(
  rows: Awaited<ReturnType<typeof getTransactionsBetween>>,
  accounts: Account[],
  categories: CategoryRow[],
): ActivityItem[] {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as EntryKind,
    occurredOn: row.occurred_on,
    amountMinor: row.amount_minor,
    currency: row.currency,
    amountGhsMinor: row.amount_ghs_minor,
    note: row.note,
    categoryLabel: row.category_id ? categoryPath(categories, row.category_id) : "",
    accountName: accountNames.get(row.account_id) ?? "",
    accountId: row.account_id,
  }));
}

// One expense or income, or null when it does not exist, belongs to
// someone else, or is a transfer (edited in build step 6).
export async function getTransaction(id: string): Promise<Transaction | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(`${COLUMNS}, fx_rate, fx_source, account_amount_minor`)
    .eq("id", id)
    .maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the transaction: ${error.message}`);
  if (!data || data.kind === "transfer" || !data.category_id) return null;
  return {
    id: data.id,
    kind: data.kind,
    occurredOn: data.occurred_on,
    accountId: data.account_id,
    categoryId: data.category_id,
    amountMinor: data.amount_minor,
    currency: data.currency,
    rate: data.fx_rate.toFixed(6),
    rateSource: data.fx_source,
    accountAmountMinor: data.account_amount_minor,
    note: data.note,
  };
}
