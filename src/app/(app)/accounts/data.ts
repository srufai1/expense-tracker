import "server-only";

import type { AccountType } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { fetchAllPages } from "@/lib/pages";
import type { Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalanceMinor: number;
  openingBalanceOn: string;
  archived: boolean;
  // Calculated by the database on every read, never stored (M-8, D-30).
  balanceMinor: number;
  // Once it has transactions, the account's currency is locked.
  hasTransactions: boolean;
};

const COLUMNS = "id, name, type, currency, opening_balance_minor, opening_balance_on, archived_at";

type Row = {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  opening_balance_minor: number;
  opening_balance_on: string;
  archived_at: string | null;
};

type Balance = { balanceMinor: number; hasTransactions: boolean };

function toAccount(row: Row, balance: Balance | undefined): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceMinor: row.opening_balance_minor,
    openingBalanceOn: row.opening_balance_on,
    archived: row.archived_at !== null,
    // No balance row only if the account was added between the two reads.
    balanceMinor: balance?.balanceMinor ?? row.opening_balance_minor,
    hasTransactions: balance?.hasTransactions ?? false,
  };
}

// Balances from the account_balances view (see the transactions migration).
async function getBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId?: string,
): Promise<Map<string, Balance>> {
  let query = supabase.from("account_balances").select("account_id, balance_minor, has_transactions");
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load balances: ${error.message}`);
  return new Map(
    data.map((row) => [row.account_id, { balanceMinor: row.balance_minor, hasTransactions: row.has_transactions }]),
  );
}

// All of the signed-in user's accounts, oldest first. Row-Level Security
// limits the query to their own rows.
export async function getAccounts(): Promise<Account[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load accounts: ${error.message}`);
  const balances = await getBalances(supabase);
  return data.map((row) => toAccount(row, balances.get(row.id)));
}

// One account, or null when it does not exist or belongs to someone else.
export async function getAccount(id: string): Promise<Account | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select(COLUMNS).eq("id", id).maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the account: ${error.message}`);
  if (!data) return null;
  const balances = await getBalances(supabase, data.id);
  return toAccount(data, balances.get(data.id));
}

// Includes all school dates: this is what is still held, not just the
// change since an account's opening date. RLS applies to the source view.
export async function getSchoolHeldByAccount(): Promise<Map<string, number>> {
  await requireUser();
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) => supabase.from("school_cash_moves")
    .select("account_id, occurred_on, source, ref_id, amount_minor")
    .order("account_id").order("occurred_on").order("source").order("ref_id").order("amount_minor").range(from, to));
  const held = new Map<string, number>();
  for (const row of rows) held.set(row.account_id, (held.get(row.account_id) ?? 0) + row.amount_minor);
  return held;
}
