import { pickRate, type StoredRate } from "./fx";
import { convertToGhs, type Currency } from "./money";
import { dueDates, nextOccurrence, type Frequency } from "./recurring";
import { buildTransactionRow, safeConvert, type EntryKind } from "./transactions";

// What the daily job does with one recurring rule (DESIGN §6.6): a
// transaction for every due date, and the next date to run. Pure, so it is
// tested here; the route only reads the rules and writes the result.

export type RuleToRun = {
  id: string;
  userId: string;
  kind: EntryKind | "transfer";
  accountId: string;
  categoryId: string | null;
  toAccountId: string | null;
  amountMinor: number;
  currency: Currency;
  note: string;
  frequency: Frequency;
  weekday: number | null;
  dayOfMonth: number | null;
  nextRunOn: string;
  endsOn: string | null;
  paused: boolean;
};

export type OccurrenceRow = {
  user_id: string;
  recurring_rule_id: string;
  occurrence_date: string;
  kind: EntryKind | "transfer";
  occurred_on: string;
  account_id: string;
  category_id: string | null;
  to_account_id: string | null;
  to_amount_minor: number | null;
  amount_minor: number;
  currency: Currency;
  fx_rate: string;
  fx_source: "none" | "auto" | "manual";
  fx_rate_date: string | null;
  amount_ghs_minor: number;
  account_amount_minor: number;
  note: string;
};

// The rows to create and the new next_run_on. It stops at the first date it
// cannot create (for example no rate yet, M-6): that date stays due, and
// `error` says why, so the next run tries again instead of skipping it.
export function planRule(
  rule: RuleToRun,
  accountCurrency: Currency,
  toAccountCurrency: Currency | null,
  rates: StoredRate[],
  today: string,
): { rows: OccurrenceRow[]; nextRunOn: string; error: string | null } {
  const rows: OccurrenceRow[] = [];
  let nextRunOn = rule.nextRunOn;
  for (const date of dueDates(rule, today)) {
    const made = occurrenceRow(rule, accountCurrency, toAccountCurrency, rates, date);
    if (!made.ok) return { rows, nextRunOn, error: made.error };
    rows.push(made.row);
    nextRunOn = nextOccurrence(rule, date);
  }
  return { rows, nextRunOn, error: null };
}

function occurrenceRow(
  rule: RuleToRun,
  accountCurrency: Currency,
  toAccountCurrency: Currency | null,
  rates: StoredRate[],
  date: string,
): { ok: true; row: OccurrenceRow } | { ok: false; error: string } {
  const needsRate = rule.currency === "USD" || accountCurrency === "USD";
  const stored = needsRate ? pickRate(rates, date) : null;
  if (needsRate && stored === null) return { ok: false, error: `No exchange rate is stored for ${date}.` };
  const link = { user_id: rule.userId, recurring_rule_id: rule.id, occurrence_date: date };

  if (rule.kind === "transfer") {
    // D-38: one currency, the accounts' own.
    if (!rule.toAccountId || toAccountCurrency !== accountCurrency || rule.currency !== accountCurrency) {
      return { ok: false, error: "A recurring transfer needs two accounts in one currency." };
    }
    const usd = rule.currency === "USD";
    const amountGhs = usd && stored ? safeConvert(() => convertToGhs(rule.amountMinor, stored.rate)) : rule.amountMinor;
    if (amountGhs === null) return { ok: false, error: "The amount is too large to convert." };
    return {
      ok: true,
      row: {
        ...link,
        kind: "transfer",
        occurred_on: date,
        account_id: rule.accountId,
        category_id: null,
        to_account_id: rule.toAccountId,
        to_amount_minor: rule.amountMinor,
        amount_minor: rule.amountMinor,
        currency: rule.currency,
        fx_rate: usd && stored ? stored.rate : "1",
        fx_source: usd ? "auto" : "none",
        fx_rate_date: usd && stored ? stored.rateDate : null,
        amount_ghs_minor: amountGhs,
        account_amount_minor: rule.amountMinor,
        note: rule.note,
      },
    };
  }

  if (!rule.categoryId) return { ok: false, error: "The recurring item has no category." };
  // The same row as a hand-entered transaction at the stored rate, so the
  // GHS value and the account amount follow M-4, M-7 and D-36.
  const built = buildTransactionRow(
    {
      kind: rule.kind,
      amountMinor: rule.amountMinor,
      currency: rule.currency,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      occurredOn: date,
      rate: stored?.rate ?? "",
      accountAmountMinor: null,
      note: rule.note,
    },
    accountCurrency,
    stored,
  );
  if (!built.ok) return { ok: false, error: Object.values(built.errors).join(" ") };
  return { ok: true, row: { ...link, ...built.row, to_account_id: null, to_amount_minor: null } };
}
