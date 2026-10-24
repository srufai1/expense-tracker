import "server-only";

import { requireUser } from "@/lib/auth";
import type { CategoryRow } from "@/lib/categories";
import { categoryPath } from "@/lib/categories";
import type { Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { ActivityItem, EntryKind } from "@/lib/transactions";

import type { Account } from "../accounts/data";

// An expense or income, as the edit form needs it.
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

// A transfer with its fee, as the transfer form needs it.
export type Transfer = {
  id: string;
  occurredOn: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  receivedMinor: number;
  currency: Currency;
  rate: string;
  feeMinor: number | null;
  note: string;
};

const LIST_COLUMNS =
  "id, kind, occurred_on, account_id, category_id, amount_minor, currency, amount_ghs_minor, note, to_account_id, to_amount_minor";

// Everything in one period, newest first: expenses, income, transfers and
// transfer fees.
export async function getTransactionsBetween(first: string, last: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(LIST_COLUMNS)
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
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return rows.map((row) => {
    const to = row.to_account_id ? byId.get(row.to_account_id) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      occurredOn: row.occurred_on,
      amountMinor: row.amount_minor,
      currency: row.currency,
      amountGhsMinor: row.amount_ghs_minor,
      note: row.note,
      categoryLabel: row.category_id ? categoryPath(categories, row.category_id) : "",
      accountName: byId.get(row.account_id)?.name ?? "",
      accountId: row.account_id,
      transfer:
        row.kind === "transfer" && row.to_account_id && row.to_amount_minor !== null
          ? {
              toAccountId: row.to_account_id,
              toAccountName: to?.name ?? "",
              receivedMinor: row.to_amount_minor,
              toCurrency: to?.currency ?? row.currency,
            }
          : null,
    };
  });
}

const ONE_COLUMNS =
  "id, kind, occurred_on, account_id, category_id, amount_minor, currency, fx_rate, fx_source, account_amount_minor, to_account_id, to_amount_minor, parent_transaction_id, note";

// One row, for the edit page: an expense or income, a transfer (with its
// fee), or a fee, which is edited through its transfer. null when it does
// not exist or belongs to someone else.
export async function getEditable(
  id: string,
): Promise<
  | { kind: "entry"; transaction: Transaction }
  | { kind: "transfer"; transfer: Transfer }
  | { kind: "fee"; transferId: string }
  | null
> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions").select(ONE_COLUMNS).eq("id", id).maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the transaction: ${error.message}`);
  if (!data) return null;

  if (data.parent_transaction_id) return { kind: "fee", transferId: data.parent_transaction_id };

  if (data.kind === "transfer") {
    if (!data.to_account_id || data.to_amount_minor === null) return null;
    const { data: fee, error: feeError } = await supabase
      .from("transactions")
      .select("amount_minor")
      .eq("parent_transaction_id", data.id)
      .maybeSingle();
    if (feeError) throw new Error(`Could not load the transfer fee: ${feeError.message}`);
    return {
      kind: "transfer",
      transfer: {
        id: data.id,
        occurredOn: data.occurred_on,
        fromAccountId: data.account_id,
        toAccountId: data.to_account_id,
        amountMinor: data.amount_minor,
        receivedMinor: data.to_amount_minor,
        currency: data.currency,
        rate: data.fx_rate.toFixed(6),
        feeMinor: fee?.amount_minor ?? null,
        note: data.note,
      },
    };
  }

  if (!data.category_id) return null;
  return {
    kind: "entry",
    transaction: {
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
    },
  };
}
