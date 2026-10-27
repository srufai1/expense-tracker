// All amounts are in the account's currency, in whole pesewas/cents (M-1).
export type AccountMovement = {
  id: string;
  date: string;
  amountMinor: number;
  school: boolean;
  label: string;
  href: string;
};

// School records have dates, not event times. Show daily closing balances
// instead of inventing an order between school records and transactions.
export function accountHistory(openingMinor: number, openingOn: string, movements: AccountMovement[]) {
  const days = new Map<string, AccountMovement[]>();
  const beforeOpening: AccountMovement[] = [];
  let schoolHeldMinor = 0;
  for (const movement of movements) {
    if (movement.school) schoolHeldMinor += movement.amountMinor;
    if (movement.date < openingOn) {
      beforeOpening.push(movement);
      continue;
    }
    const entries = days.get(movement.date) ?? [];
    entries.push(movement);
    days.set(movement.date, entries);
  }
  let balanceMinor = openingMinor;
  const history = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => {
    const changeMinor = entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
    balanceMinor += changeMinor;
    return { date, entries, changeMinor, balanceMinor };
  });
  return { days: history.reverse(), beforeOpening, balanceMinor, schoolHeldMinor, personalMinor: balanceMinor - schoolHeldMinor };
}

export function transactionAccountChange(accountId: string, row: {
  account_id: string;
  kind: "income" | "expense" | "transfer";
  account_amount_minor: number;
  to_amount_minor: number | null;
}): number {
  if (row.account_id !== accountId) return row.to_amount_minor ?? 0;
  return row.kind === "income" ? row.account_amount_minor : -row.account_amount_minor;
}
