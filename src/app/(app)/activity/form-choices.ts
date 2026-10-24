import "server-only";

import { categoryOptions } from "@/lib/transactions";

import { getAccounts } from "../accounts/data";
import { getCategories } from "../categories/data";
import { getRates } from "./rates";

// The accounts, categories and stored rates the transaction form needs.
// Archived accounts and categories are left out, except the ones an
// existing transaction already uses.
export async function getFormChoices(keep: { accountIds?: string[]; categoryId?: string } = {}) {
  const [accounts, categories, rates] = await Promise.all([getAccounts(), getCategories(), getRates()]);
  return {
    accounts: accounts
      .filter((account) => !account.archived || keep.accountIds?.includes(account.id))
      .map((account) => ({ id: account.id, name: account.name, currency: account.currency })),
    categories: {
      expense: categoryOptions(categories, "expense", keep.categoryId),
      income: categoryOptions(categories, "income", keep.categoryId),
    },
    rates,
  };
}
