import { accountTypeLabel, type AccountType } from "../accounts";
import type { BudgetRow } from "../budgets";
import { categoryPath, type CategoryRow } from "../categories";
import { formatMonth } from "../dates";
import type { Currency } from "../money";
import type { Report } from "../reports/build";
import { schoolSheets, type SchoolBackup } from "./school-sheets";

// What goes into the Excel files (DESIGN D-20), as plain rows, so it can be
// tested without building a file. workbook.ts writes them with exceljs.

export type Cell = string | number | null;
export type Column = { header: string; width: number; format?: "money" };
export type Sheet = { name: string; columns: Column[]; rows: Cell[][] };

// A spreadsheet cell needs a number to add up. Money stays whole pesewas
// everywhere else (M-1); it becomes GHS only here, at the very last step,
// and a spreadsheet is never read back.
export const money = (minor: number) => minor / 100;

// A transaction row as the export query reads it.
export type TransactionRowForExport = {
  id: string;
  kind: "expense" | "income" | "transfer";
  occurred_on: string;
  account_id: string;
  category_id: string | null;
  to_account_id: string | null;
  amount_minor: number;
  currency: Currency;
  fx_rate: number;
  amount_ghs_minor: number;
  // What actually left or entered the account, in its own currency; it can
  // differ from the converted amount when corrected (M-7).
  account_amount_minor: number;
  to_amount_minor: number | null;
  note: string;
};

export type ExportTransaction = {
  id: string;
  occurredOn: string;
  kind: "expense" | "income" | "transfer";
  categoryLabel: string;
  accountName: string;
  toAccountName: string;
  amountMinor: number;
  currency: Currency;
  // GHS for 1 USD, as stored with the row (M-2).
  rate: string;
  amountGhsMinor: number;
  // What the account was charged (or received), in the account's currency (M-7).
  accountAmountMinor: number;
  accountCurrency: Currency;
  // A transfer: the amount that arrived, in the receiving account's currency.
  receivedMinor: number | null;
  receivedCurrency: Currency | null;
  note: string;
};

// Rows with the names an export shows, oldest first.
export function exportTransactions(
  rows: TransactionRowForExport[],
  accounts: { id: string; name: string; currency: Currency }[],
  categories: CategoryRow[],
): ExportTransaction[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return rows
    .map((row) => {
      const account = byId.get(row.account_id);
      const to = row.to_account_id ? byId.get(row.to_account_id) : undefined;
      return {
        id: row.id,
        occurredOn: row.occurred_on,
        kind: row.kind,
        categoryLabel: row.category_id ? categoryPath(categories, row.category_id) : "",
        accountName: account?.name ?? "",
        toAccountName: to?.name ?? "",
        amountMinor: row.amount_minor,
        currency: row.currency,
        rate: row.fx_rate.toFixed(6),
        amountGhsMinor: row.amount_ghs_minor,
        accountAmountMinor: row.account_amount_minor,
        accountCurrency: account?.currency ?? row.currency,
        receivedMinor: row.to_amount_minor,
        receivedCurrency: row.to_amount_minor === null ? null : (to?.currency ?? row.currency),
        note: row.note,
      };
    })
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
}

const KIND_LABEL = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;

export const TRANSACTION_COLUMNS: Column[] = [
  { header: "Date", width: 12 },
  { header: "Type", width: 10 },
  { header: "Category", width: 28 },
  { header: "Account", width: 18 },
  { header: "To account", width: 18 },
  { header: "Amount", width: 14, format: "money" },
  { header: "Currency", width: 9 },
  { header: "Rate (GHS per USD)", width: 16 },
  { header: "GHS value", width: 14, format: "money" },
  { header: "Account amount", width: 14, format: "money" },
  { header: "Account currency", width: 9 },
  { header: "Received", width: 14, format: "money" },
  { header: "Note", width: 30 },
];

export function transactionRow(t: ExportTransaction): Cell[] {
  return [
    t.occurredOn,
    KIND_LABEL[t.kind],
    t.categoryLabel,
    t.accountName,
    t.toAccountName,
    money(t.amountMinor),
    t.currency,
    t.currency === "GHS" ? "" : t.rate,
    money(t.amountGhsMinor),
    money(t.accountAmountMinor),
    t.accountCurrency,
    t.receivedMinor === null ? null : money(t.receivedMinor),
    t.note,
  ];
}

const signedPercent = (percent: number) => (percent > 0 ? `+${percent}%` : `${percent}%`);
const AVERAGE_LABEL = { week: "4-week average spent (GHS)", month: "3-month average spent (GHS)" } as const;
const STATUS = { over: "Over", watch: "Watch", ok: "OK" } as const;

// The report workbook: the same numbers as the Reports screen and the PDF.
export function reportSheets(report: Report, transactions: ExportTransaction[], title: string): Sheet[] {
  const { totals, previous, average, period } = report;
  const summary: Cell[][] = [
    ["Period", title],
    ["Spent (GHS)", money(totals.spendingMinor)],
    ["Income (GHS)", money(totals.incomeMinor)],
    ["Net (GHS)", money(totals.netMinor)],
    ["Saved", totals.savedPercent === null ? "—" : `${totals.savedPercent}%`],
    ["Previous period spent (GHS)", money(previous.spendingMinor)],
    ["Change from previous period", previous.spendingChangePercent === null ? "—" : signedPercent(previous.spendingChangePercent)],
  ];
  if (average && (period.kind === "week" || period.kind === "month")) {
    summary.push([
      AVERAGE_LABEL[period.kind],
      average.status === "ok" ? money(average.spendingMinor) : "not enough history yet",
    ]);
  }
  if (report.mostSpentOn.length > 0) summary.push(["Most spent on", report.mostSpentOn.join(", ")]);
  if (report.leastSpentOn.length > 0) summary.push(["Least spent on", report.leastSpentOn.join(", ")]);
  if (report.biggestExpense) summary.push(["Biggest expense (GHS)", money(report.biggestExpense.amountGhsMinor)]);
  if (report.busiestDay) summary.push(["Busiest day", report.busiestDay.date]);
  if (report.fees.count > 0) summary.push(["Fees (GHS)", money(report.fees.totalMinor)]);

  const sheets: Sheet[] = [
    { name: "Summary", columns: [{ header: "", width: 30 }, { header: "", width: 24 }], rows: summary },
    {
      name: "Categories",
      columns: [
        { header: "Category", width: 24 },
        { header: "Sub-category", width: 24 },
        { header: "Spent (GHS)", width: 14, format: "money" },
        { header: "Share %", width: 10 },
      ],
      rows: report.categories.flatMap((line) => [
        [line.name, "", money(line.spentMinor), line.sharePercent],
        ...line.children.map((child) => [line.name, child.name, money(child.spentMinor), child.sharePercent]),
      ]),
    },
    {
      name: "Transactions",
      columns: TRANSACTION_COLUMNS,
      rows: transactions
        .filter((t) => t.occurredOn >= period.first && t.occurredOn <= period.last)
        .map(transactionRow),
    },
  ];

  const lines = report.budgets?.lines ?? [];
  if (report.budgets && lines.length > 0) {
    sheets.push({
      name: "Budgets",
      columns: [
        { header: `Category (${formatMonth(report.budgets.month)})`, width: 28 },
        { header: "Budget (GHS)", width: 14, format: "money" },
        { header: "Spent (GHS)", width: 14, format: "money" },
        { header: "Left (GHS)", width: 14, format: "money" },
        { header: "Status", width: 10 },
      ],
      rows: lines.map((line) => [
        line.label,
        money(line.budgetMinor),
        money(line.spentMinor),
        money(line.budgetMinor - line.spentMinor),
        STATUS[line.status],
      ]),
    });
  }
  if (report.goals.length > 0) {
    sheets.push({
      name: "Goals",
      columns: [
        { header: "Goal", width: 24 },
        { header: "Target (GHS)", width: 14, format: "money" },
        { header: "Saved (GHS)", width: 14, format: "money" },
        { header: "Saved %", width: 10 },
        { header: "Target date", width: 12 },
        { header: "Needed per week (GHS)", width: 20, format: "money" },
      ],
      rows: report.goals.map((goal) => [
        goal.name,
        money(goal.targetMinor),
        money(goal.savedMinor),
        goal.percent,
        goal.targetDate,
        goal.neededPerWeekMinor === null ? null : money(goal.neededPerWeekMinor),
      ]),
    });
  }
  if (report.suggestions.length > 0) {
    sheets.push({
      name: "Suggestions",
      columns: [{ header: "Suggestion", width: 100 }],
      rows: report.suggestions.map((text) => [text]),
    });
  }
  return sheets;
}

export type BackupData = {
  accounts: {
    name: string;
    type: AccountType;
    currency: Currency;
    openingBalanceMinor: number;
    openingBalanceOn: string;
    balanceMinor: number;
    archived: boolean;
  }[];
  categories: CategoryRow[];
  transactions: ExportTransaction[];
  budgets: BudgetRow[];
  goals: {
    name: string;
    targetMinor: number;
    targetDate: string;
    archived: boolean;
    contributions: { occurredOn: string; amountMinor: number; note: string }[];
  }[];
  recurring: {
    // "Food › Groceries", "Cash → Bank" or "To Emergency fund".
    what: string;
    kind: "expense" | "income" | "transfer" | "goal_contribution";
    amountMinor: number;
    currency: Currency;
    schedule: string;
    startsOn: string;
    endsOn: string | null;
    nextRunOn: string;
    paused: boolean;
    note: string;
  }[];
  // School money (D-57), or null when it is not set up.
  school?: SchoolBackup | null;
};

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const RULE_KIND_LABEL = { ...KIND_LABEL, goal_contribution: "Goal" } as const;

// "Export everything" (§11): every record, readable in Excel. The free
// Supabase plan has no automatic backups, so this file is the backup.
export function everythingSheets(data: BackupData): Sheet[] {
  const byOrder = (a: CategoryRow, b: CategoryRow) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const categoryRows: Cell[][] = [];
  for (const kind of ["expense", "income"] as const) {
    for (const top of data.categories.filter((c) => c.kind === kind && c.parentId === null).sort(byOrder)) {
      categoryRows.push([kind === "expense" ? "Expense" : "Income", top.name, "", yesNo(top.archived)]);
      for (const child of data.categories.filter((c) => c.parentId === top.id).sort(byOrder)) {
        categoryRows.push([kind === "expense" ? "Expense" : "Income", top.name, child.name, yesNo(child.archived)]);
      }
    }
  }
  const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

  return [
    {
      name: "Accounts",
      columns: [
        { header: "Account", width: 20 },
        { header: "Type", width: 14 },
        { header: "Currency", width: 9 },
        { header: "Opening balance", width: 16, format: "money" },
        { header: "Opening date", width: 12 },
        { header: "Balance now", width: 16, format: "money" },
        { header: "Archived", width: 9 },
      ],
      rows: data.accounts.map((a) => [
        a.name,
        accountTypeLabel(a.type),
        a.currency,
        money(a.openingBalanceMinor),
        a.openingBalanceOn,
        money(a.balanceMinor),
        yesNo(a.archived),
      ]),
    },
    {
      name: "Categories",
      columns: [
        { header: "Type", width: 9 },
        { header: "Category", width: 24 },
        { header: "Sub-category", width: 24 },
        { header: "Archived", width: 9 },
      ],
      rows: categoryRows,
    },
    { name: "Transactions", columns: TRANSACTION_COLUMNS, rows: data.transactions.map(transactionRow) },
    {
      name: "Budgets",
      columns: [
        { header: "Category", width: 28 },
        { header: "From month", width: 11 },
        { header: "Budget per month (GHS)", width: 20, format: "money" },
      ],
      rows: data.budgets.map((b) => [
        categoryPath(data.categories, b.categoryId),
        b.effectiveFrom.slice(0, 7),
        money(b.amountMinor),
      ]),
    },
    {
      name: "Goals",
      columns: [
        { header: "Goal", width: 24 },
        { header: "Target (GHS)", width: 14, format: "money" },
        { header: "Saved (GHS)", width: 14, format: "money" },
        { header: "Target date", width: 12 },
        { header: "Archived", width: 9 },
      ],
      rows: data.goals.map((g) => [
        g.name,
        money(g.targetMinor),
        money(sum(g.contributions.map((c) => c.amountMinor))),
        g.targetDate,
        yesNo(g.archived),
      ]),
    },
    {
      name: "Goal contributions",
      columns: [
        { header: "Goal", width: 24 },
        { header: "Date", width: 12 },
        { header: "Amount (GHS)", width: 14, format: "money" },
        { header: "Note", width: 30 },
      ],
      rows: data.goals.flatMap((g) => g.contributions.map((c) => [g.name, c.occurredOn, money(c.amountMinor), c.note])),
    },
    {
      name: "Recurring",
      columns: [
        { header: "What", width: 28 },
        { header: "Type", width: 10 },
        { header: "Amount", width: 14, format: "money" },
        { header: "Currency", width: 9 },
        { header: "Schedule", width: 28 },
        { header: "Starts", width: 12 },
        { header: "Ends", width: 12 },
        { header: "Next date", width: 12 },
        { header: "Paused", width: 8 },
        { header: "Note", width: 30 },
      ],
      rows: data.recurring.map((r) => [
        r.what,
        RULE_KIND_LABEL[r.kind],
        money(r.amountMinor),
        r.currency,
        r.schedule,
        r.startsOn,
        r.endsOn ?? "",
        r.nextRunOn,
        yesNo(r.paused),
        r.note,
      ]),
    },
    ...(data.school ? schoolSheets(data.school) : []),
  ];
}
