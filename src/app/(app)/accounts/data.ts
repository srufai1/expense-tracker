import "server-only";

import type { AccountType } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
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
  // Calculated, never stored (M-8). There are no transactions yet, so the
  // balance is the opening balance; build step 4 adds the transactions.
  balanceMinor: number;
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

function toAccount(row: Row): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceMinor: row.opening_balance_minor,
    openingBalanceOn: row.opening_balance_on,
    archived: row.archived_at !== null,
    balanceMinor: row.opening_balance_minor,
  };
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
  return data.map(toAccount);
}

// One account, or null when it does not exist or belongs to someone else.
export async function getAccount(id: string): Promise<Account | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select(COLUMNS).eq("id", id).maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the account: ${error.message}`);
  return data ? toAccount(data) : null;
}
