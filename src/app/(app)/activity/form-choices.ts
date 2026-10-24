import "server-only";

import { categoryOptions } from "@/lib/transactions";

import { getAccounts } from "../accounts/data";
import { getCategories } from "../categories/data";

// The accounts and categories the transaction form offers. Archived ones
// are left out, except the ones an existing transaction already uses.
// Only GHS accounts for now: USD comes with exchange rates (build step 5).
export async function getFormChoices(keep: { accountId?: string; categoryId?: string } = {}) {
  const [accounts, categories] = await Promise.all([getAccounts(), getCategories()]);
  return {
    accounts: accounts
      .filter((account) => account.currency === "GHS" && (!account.archived || account.id === keep.accountId))
      .map((account) => ({ id: account.id, name: account.name })),
    hasUsdAccounts: accounts.some((account) => account.currency === "USD" && !account.archived),
    categories: {
      expense: categoryOptions(categories, "expense", keep.categoryId),
      income: categoryOptions(categories, "income", keep.categoryId),
    },
  };
}
