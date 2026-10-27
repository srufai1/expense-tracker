import "server-only";

import { accountHistory, transactionAccountChange, type AccountMovement } from "@/lib/account-history";
import { categoryPath, type CategoryRow } from "@/lib/categories";
import { requireUser } from "@/lib/auth";
import { fetchAllPages } from "@/lib/pages";
import { createClient } from "@/lib/supabase/server";

import type { Account } from "./data";

const schoolLabels: Record<string, string> = {
  morning: "Morning classes", fee: "School fees", books: "School books",
  fund_morning: "School savings fund", fund_books: "Teachers’ book fund",
};

export async function getAccountHistory(account: Account) {
  await requireUser();
  const supabase = await createClient();
  // Separate queries avoid interpolating an untrusted address into an OR filter.
  const [outgoing, incoming, school, accounts, categories] = await Promise.all([
    fetchAllPages((from, to) => supabase.from("transactions").select("id, kind, occurred_on, account_id, account_amount_minor, to_account_id, to_amount_minor, parent_transaction_id, category_id, note").eq("account_id", account.id).order("occurred_on").order("created_at").order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("transactions").select("id, kind, occurred_on, account_id, account_amount_minor, to_account_id, to_amount_minor, parent_transaction_id, category_id, note").eq("to_account_id", account.id).order("occurred_on").order("created_at").order("id").range(from, to)),
    // Equal sort keys here are identical movements; no distinct values can
    // exchange places across page boundaries. Display balances per day.
    fetchAllPages((from, to) => supabase.from("school_cash_moves").select("occurred_on, source, ref_id, amount_minor").eq("account_id", account.id).order("occurred_on").order("source").order("ref_id").order("amount_minor").range(from, to)),
    fetchAllPages((from, to) => supabase.from("accounts").select("id, name").order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("categories").select("id, kind, parent_id, name, system_key, sort_order, archived_at").order("id").range(from, to)),
  ]);
  const names = new Map(accounts.map(a => [a.id, a.name]));
  const categoryRows: CategoryRow[] = categories.map(row => ({ id: row.id, kind: row.kind, parentId: row.parent_id, name: row.name, systemKey: row.system_key, sortOrder: row.sort_order, archived: row.archived_at !== null }));
  const movements: AccountMovement[] = [...outgoing, ...incoming].map(row => {
    const transfer = row.kind === "transfer";
    const incoming = row.account_id !== account.id;
    const kindLabel = transfer ? `Transfer ${incoming ? "from" : "to"} ${names.get(incoming ? row.account_id : row.to_account_id!) ?? "another account"}` : row.parent_transaction_id ? "Transfer fee" : row.kind === "income" ? "Income" : "Expense";
    const label = row.category_id ? `${kindLabel} · ${categoryPath(categoryRows, row.category_id)}` : kindLabel;
    return { id: row.id, date: row.occurred_on, amountMinor: transactionAccountChange(account.id, row), school: false,
      label: row.note ? `${label} · ${row.note}` : label, href: `/activity/${row.parent_transaction_id ?? row.id}` };
  });
  school.forEach((row, i) => movements.push({ id: `school-${i}`, date: row.occurred_on, amountMinor: row.amount_minor, school: true,
    label: `${schoolLabels[row.source]} · ${row.amount_minor < 0 ? "out / reclassified" : "in"}`, href: "/school" }));
  return accountHistory(account.openingBalanceMinor, account.openingBalanceOn, movements);
}
