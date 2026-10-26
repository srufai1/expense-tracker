import { FUND_PURPOSES, FUNDS, NO_CLASS_REASONS, payStatus, RECIPIENTS, type Fund, type FundPurpose, type NoClassReason, type Recipient } from "../school/fees";
import { CLASSES, dayTotals, type MorningDay } from "../school/morning";
import { money, type Cell, type Sheet } from "./sheets";

// School money in "Export everything" (D-57): every record, readable in
// Excel, so the backup holds the school's money too. Plain rows here
// (tested); workbook.ts writes them.

export type SchoolBackup = {
  accountName: string;
  // What is held for the school now (the Cash balance includes it).
  heldMinor: number;
  days: (MorningDay & { reason: NoClassReason | null; note: string })[];
  weeks: {
    weekStart: string;
    settledOn: string;
    classDays: number;
    collectedMinor: number;
    schoolMinor: number;
    savingsMinor: number;
    markersMinor: number;
    assistantMinor: number;
    eachMinor: number;
    shares: { name: string; isMe: boolean; amountMinor: number; paidOn: string | null }[];
  }[];
  fundSpends: { fund: Fund; spentOn: string; amountMinor: number; purpose: FundPurpose; note: string }[];
  fees: {
    name: string;
    amountMinor: number;
    archived: boolean;
    students: {
      name: string;
      className: string;
      payableMinor: number;
      payments: { paidOn: string; amountMinor: number; note: string }[];
    }[];
    handovers: { toWhom: Recipient; handedOn: string; amountMinor: number; note: string }[];
  }[];
  subjects: { name: string; priceMinor: number }[];
  purchases: { subject: string; boughtOn: string; quantity: number; amountMinor: number; note: string }[];
  bookStudents: {
    name: string;
    className: string;
    orders: {
      subject: string;
      priceMinor: number;
      givenOn: string | null;
      split: { costMinor: number; transportMinor: number; mineMinor: number; teachersMinor: number } | null;
    }[];
    payments: { paidOn: string; amountMinor: number; note: string }[];
  }[];
};

const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);
const byDate = <T>(date: (row: T) => string) => (a: T, b: T) => date(a).localeCompare(date(b));

// What the status column says for one student: as on the fee page.
function statusText(payableMinor: number, paidMinor: number): string {
  const status = payStatus(payableMinor, paidMinor);
  switch (status.kind) {
    case "free":
      return "Full discount";
    case "paid":
      return "Paid";
    case "over":
      return "Paid (extra)";
    case "unpaid":
      return "Not paid";
    case "part":
      return "Advance";
  }
}

function balance(payableMinor: number, paidMinor: number): number {
  return Math.max(0, payableMinor - paidMinor);
}

export function schoolSheets(data: SchoolBackup): Sheet[] {
  const savingsFund =
    sum(data.weeks.map((w) => w.savingsMinor)) -
    sum(data.fundSpends.filter((s) => s.fund === "morning").map((s) => s.amountMinor));
  const bookFund =
    sum(data.bookStudents.flatMap((s) => s.orders.map((o) => o.split?.teachersMinor ?? 0))) -
    sum(data.fundSpends.filter((s) => s.fund === "books").map((s) => s.amountMinor));

  const summaryRows: Cell[][] = [
    ["Kept in", data.accountName],
    ["Holding for the school (GHS)", money(data.heldMinor)],
    [FUNDS.morning + " (GHS)", money(savingsFund)],
    [FUNDS.books + " (GHS)", money(bookFund)],
    ...data.fees.map((fee): Cell[] => [
      `${fee.name}: holding (GHS)`,
      money(
        sum(fee.students.flatMap((s) => s.payments.map((p) => p.amountMinor))) - sum(fee.handovers.map((h) => h.amountMinor)),
      ),
    ]),
  ];

  const dayColumns = CLASSES.flatMap((name) => [
    { header: `${name} full`, width: 9 },
    { header: `${name} paid less`, width: 12, format: "money" as const },
  ]);

  return [
    {
      name: "School money",
      columns: [
        { header: "", width: 34 },
        { header: "", width: 18, format: "money" },
      ],
      rows: summaryRows,
    },
    {
      name: "Morning days",
      columns: [
        { header: "Date", width: 12 },
        { header: "Class", width: 9 },
        ...dayColumns,
        { header: "Collected", width: 12, format: "money" },
        { header: "School", width: 10, format: "money" },
        { header: "No class reason", width: 14 },
        { header: "Note", width: 24 },
      ],
      rows: [...data.days].sort(byDate((d) => d.date)).map((day) => {
        const totals = dayTotals(day);
        return [
          day.date,
          day.noClass ? "No" : "Yes",
          ...day.full.flatMap((full, i) => [full, money(day.lessMinor[i])]),
          money(totals.collectedMinor),
          money(totals.schoolMinor),
          day.reason ? NO_CLASS_REASONS[day.reason] : "",
          day.note,
        ];
      }),
    },
    {
      name: "Morning weeks",
      columns: [
        { header: "Week of", width: 12 },
        { header: "Settled on", width: 12 },
        { header: "Class days", width: 10 },
        { header: "Collected", width: 12, format: "money" },
        { header: "School", width: 10, format: "money" },
        { header: "Savings", width: 10, format: "money" },
        { header: "Markers", width: 10, format: "money" },
        { header: "Assistant headmistress", width: 12, format: "money" },
        { header: "Each", width: 10, format: "money" },
        { header: "Shared by", width: 9 },
      ],
      rows: [...data.weeks]
        .sort(byDate((w) => w.weekStart))
        .map((w) => [
          w.weekStart,
          w.settledOn,
          w.classDays,
          money(w.collectedMinor),
          money(w.schoolMinor),
          money(w.savingsMinor),
          money(w.markersMinor),
          money(w.assistantMinor),
          money(w.eachMinor),
          w.shares.length,
        ]),
    },
    {
      name: "Morning shares",
      columns: [
        { header: "Week of", width: 12 },
        { header: "Name", width: 20 },
        { header: "Amount", width: 12, format: "money" },
        { header: "Paid", width: 18 },
      ],
      rows: [...data.weeks]
        .sort(byDate((w) => w.weekStart))
        .flatMap((w) =>
          w.shares.map((s): Cell[] => [w.weekStart, s.name, money(s.amountMinor), s.isMe ? "My income" : (s.paidOn ?? "Not paid yet")]),
        ),
    },
    {
      name: "Fund spending",
      columns: [
        { header: "Fund", width: 24 },
        { header: "Date", width: 12 },
        { header: "Amount", width: 12, format: "money" },
        { header: "For", width: 18 },
        { header: "Note", width: 24 },
      ],
      rows: [...data.fundSpends]
        .sort(byDate((s) => s.spentOn))
        .map((s) => [FUNDS[s.fund], s.spentOn, money(s.amountMinor), FUND_PURPOSES[s.purpose], s.note]),
    },
    {
      name: "Fee students",
      columns: [
        { header: "Fee", width: 22 },
        { header: "Student", width: 22 },
        { header: "Class", width: 9 },
        { header: "Should pay", width: 12, format: "money" },
        { header: "Paid", width: 12, format: "money" },
        { header: "Balance", width: 12, format: "money" },
        { header: "Status", width: 13 },
      ],
      rows: data.fees.flatMap((fee) =>
        fee.students.map((s): Cell[] => {
          const paid = sum(s.payments.map((p) => p.amountMinor));
          return [fee.name, s.name, s.className, money(s.payableMinor), money(paid), money(balance(s.payableMinor, paid)), statusText(s.payableMinor, paid)];
        }),
      ),
    },
    {
      name: "Fee payments",
      columns: [
        { header: "Fee", width: 22 },
        { header: "Student", width: 22 },
        { header: "Date", width: 12 },
        { header: "Amount", width: 12, format: "money" },
        { header: "Note", width: 24 },
      ],
      rows: data.fees.flatMap((fee) =>
        fee.students
          .flatMap((s) => s.payments.map((p) => ({ student: s.name, ...p })))
          .sort(byDate((p) => p.paidOn))
          .map((p): Cell[] => [fee.name, p.student, p.paidOn, money(p.amountMinor), p.note]),
      ),
    },
    {
      name: "Hand-overs",
      columns: [
        { header: "Fee", width: 22 },
        { header: "To", width: 22 },
        { header: "Date", width: 12 },
        { header: "Amount", width: 12, format: "money" },
        { header: "Note", width: 24 },
      ],
      rows: data.fees.flatMap((fee) =>
        [...fee.handovers]
          .sort(byDate((h) => h.handedOn))
          .map((h): Cell[] => [fee.name, RECIPIENTS[h.toWhom], h.handedOn, money(h.amountMinor), h.note]),
      ),
    },
    {
      name: "Books bought",
      columns: [
        { header: "Subject", width: 18 },
        { header: "Date", width: 12 },
        { header: "Quantity", width: 9 },
        { header: "Amount", width: 12, format: "money" },
        { header: "Note", width: 24 },
      ],
      rows: [...data.purchases].sort(byDate((p) => p.boughtOn)).map((p) => [p.subject, p.boughtOn, p.quantity, money(p.amountMinor), p.note]),
    },
    {
      name: "Book orders",
      columns: [
        { header: "Student", width: 22 },
        { header: "Class", width: 9 },
        { header: "Subject", width: 18 },
        { header: "Price", width: 10, format: "money" },
        { header: "Given out", width: 12 },
        { header: "Book cost", width: 10, format: "money" },
        { header: "Transport", width: 10, format: "money" },
        { header: "Teachers", width: 10, format: "money" },
        { header: "Mine", width: 10, format: "money" },
      ],
      rows: data.bookStudents.flatMap((s) =>
        s.orders.map((o): Cell[] => [
          s.name,
          s.className,
          o.subject,
          money(o.priceMinor),
          o.givenOn ?? "Not yet",
          o.split ? money(o.split.costMinor) : null,
          o.split ? money(o.split.transportMinor) : null,
          o.split ? money(o.split.teachersMinor) : null,
          o.split ? money(o.split.mineMinor) : null,
        ]),
      ),
    },
    {
      name: "Book payments",
      columns: [
        { header: "Student", width: 22 },
        { header: "Class", width: 9 },
        { header: "Date", width: 12 },
        { header: "Amount", width: 12, format: "money" },
        { header: "Note", width: 24 },
      ],
      rows: data.bookStudents.flatMap((s) =>
        [...s.payments].sort(byDate((p) => p.paidOn)).map((p): Cell[] => [s.name, s.className, p.paidOn, money(p.amountMinor), p.note]),
      ),
    },
    {
      name: "Book subjects",
      columns: [
        { header: "Subject", width: 18 },
        { header: "Price now", width: 12, format: "money" },
      ],
      rows: data.subjects.map((s) => [s.name, money(s.priceMinor)]),
    },
  ];
}
