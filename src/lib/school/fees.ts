// School fees and book money held for others (D-55, D-56). Amounts in
// pesewas (M-1).

export const RECIPIENTS = {
  headmaster: "Headmaster",
  headmistress: "Headmistress",
  headteacher_academics: "Headteacher (Academics)",
  bursar: "Bursar",
  myself: "Myself",
} as const;
export type Recipient = keyof typeof RECIPIENTS;

export const FUNDS = {
  morning: "Morning classes savings",
  books: "Teachers' book fund",
} as const;
export type Fund = keyof typeof FUNDS;

export const FUND_PURPOSES = {
  sports: "Sports",
  science_fair: "Science fair",
  teacher_books: "Books for teachers",
  other: "Other",
} as const;
export type FundPurpose = keyof typeof FUND_PURPOSES;

export const NO_CLASS_REASONS = {
  holiday: "Holiday",
  exams: "Exams",
  other: "Other",
} as const;
export type NoClassReason = keyof typeof NO_CLASS_REASONS;

// One student against what they should pay. "Advance" is what they have
// paid towards it so far; "balance" is what they still have to pay.
export type PayStatus =
  | { kind: "free" }
  | { kind: "unpaid"; balanceMinor: number }
  | { kind: "part"; advanceMinor: number; balanceMinor: number }
  | { kind: "paid" }
  | { kind: "over"; extraMinor: number };

export function payStatus(payableMinor: number, paidMinor: number): PayStatus {
  if (paidMinor > payableMinor) return { kind: "over", extraMinor: paidMinor - payableMinor };
  if (payableMinor === 0) return { kind: "free" };
  if (paidMinor === payableMinor) return { kind: "paid" };
  if (paidMinor === 0) return { kind: "unpaid", balanceMinor: payableMinor };
  return { kind: "part", advanceMinor: paidMinor, balanceMinor: payableMinor - paidMinor };
}

export function owes(status: PayStatus): boolean {
  return status.kind === "unpaid" || status.kind === "part";
}

// The totals at the top of a fee: what came in, and what students still owe.
export function feeTotals(students: { payableMinor: number; paidMinor: number }[]): {
  collectedMinor: number;
  stillToPayMinor: number;
  owing: number;
  done: number;
} {
  let collectedMinor = 0;
  let stillToPayMinor = 0;
  let owing = 0;
  for (const student of students) {
    collectedMinor += student.paidMinor;
    const status = payStatus(student.payableMinor, student.paidMinor);
    if (owes(status)) {
      owing += 1;
      stillToPayMinor += student.payableMinor - student.paidMinor;
    }
  }
  return { collectedMinor, stillToPayMinor, owing, done: students.length - owing };
}
