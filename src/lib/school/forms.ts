import { z } from "zod";

import { isIsoDate } from "../dates";
import { parseAmount } from "../money";
import { FUND_PURPOSES, NO_CLASS_REASONS, RECIPIENTS, type FundPurpose, type NoClassReason, type Recipient } from "./fees";
import { isWeekday } from "./week";

// The School money forms (D-54 – D-56). Each parser runs in the browser
// (for the error pop-up, D-31) and again in the Server Action; the
// database checks a third time.

type Result<V, F extends string> = { ok: true; value: V } | { ok: false; errors: Partial<Record<F, string>> };

function amount(context: z.RefinementCtx, text: string, allowZero = false): number {
  const result = parseAmount(text, { allowZero });
  if (!result.ok) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.minor;
}

const money = z.string().transform((value, context) => amount(context, value));
const moneyOrZero = z.string().transform((value, context) => amount(context, value.trim() === "" ? "0" : value, true));

// Not in the future: `today` is the Accra date.
const pastDate = (today: string) =>
  z
    .string()
    .refine(isIsoDate, "Enter a real date.")
    .refine((value) => value <= today, "The date cannot be in the future.");

const note = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer.`);

const oneOf = <K extends string>(keys: readonly K[], message: string) =>
  z.string().refine((value): value is K => (keys as readonly string[]).includes(value), message) as unknown as z.ZodType<K>;

function firstErrors<F extends string>(issues: z.core.$ZodIssue[]): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const issue of issues) errors[issue.path[0] as F] ??= issue.message;
  return errors;
}

const text = (raw: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""]));

function run<V, F extends string>(schema: z.ZodType<V>, raw: Record<string, unknown>, keys: readonly F[]): Result<V, F> {
  const result = schema.safeParse(text(raw, keys));
  return result.success ? { ok: true, value: result.data } : { ok: false, errors: firstErrors<F>(result.error.issues) };
}

// --- Morning classes -------------------------------------------------

const count = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 500, "Enter a number of students, 0 to 500.")
  .transform(Number);

export const MORNING_DAY_FIELDS = ["date", "full1", "less1", "full2", "less2", "full3", "less3"] as const;
export type MorningDayErrors = Partial<Record<(typeof MORNING_DAY_FIELDS)[number], string>>;
export type MorningDayValue = { date: string; full: [number, number, number]; lessMinor: [number, number, number] };

export function parseMorningDayForm(raw: Record<string, unknown>, today: string): Result<MorningDayValue, (typeof MORNING_DAY_FIELDS)[number]> {
  const schema = z
    .object({
      date: pastDate(today).refine(isWeekday, "Morning classes are Monday to Friday."),
      full1: count,
      less1: moneyOrZero,
      full2: count,
      less2: moneyOrZero,
      full3: count,
      less3: moneyOrZero,
    })
    .transform((v) => ({
      date: v.date,
      full: [v.full1, v.full2, v.full3] as [number, number, number],
      lessMinor: [v.less1, v.less2, v.less3] as [number, number, number],
    }));
  return run(schema, raw, MORNING_DAY_FIELDS);
}

export const NO_CLASS_FIELDS = ["date", "reason", "note"] as const;
export type NoClassErrors = Partial<Record<(typeof NO_CLASS_FIELDS)[number], string>>;

export function parseNoClassForm(
  raw: Record<string, unknown>,
): Result<{ date: string; reason: NoClassReason; note: string }, (typeof NO_CLASS_FIELDS)[number]> {
  const schema = z.object({
    // A planned holiday may be marked ahead, so the date may be in the future.
    date: z.string().refine(isIsoDate, "Enter a real date.").refine(isWeekday, "Morning classes are Monday to Friday."),
    reason: oneOf(Object.keys(NO_CLASS_REASONS) as NoClassReason[], "Choose a reason."),
    note: note(100),
  });
  return run(schema, raw, NO_CLASS_FIELDS);
}

export const SETTLE_FIELDS = ["settledOn", "markers", "assistant", "sharers"] as const;
export type SettleErrors = Partial<Record<(typeof SETTLE_FIELDS)[number], string>>;

// `sharers` are the ticked names (FormData.getAll), read separately.
export function parseSettleForm(
  raw: Record<string, unknown>,
  sharers: string[],
  today: string,
): Result<{ settledOn: string; markersMinor: number; assistantMinor: number; sharerIds: string[] }, (typeof SETTLE_FIELDS)[number]> {
  const schema = z
    .object({ settledOn: pastDate(today), markers: moneyOrZero, assistant: moneyOrZero, sharers: z.string() })
    .transform((v) => ({ settledOn: v.settledOn, markersMinor: v.markers, assistantMinor: v.assistant }));
  const result = run(schema, raw, SETTLE_FIELDS);
  const sharerIds = [...new Set(sharers.filter((id) => z.uuid().safeParse(id).success))];
  if (sharerIds.length === 0) {
    const errors = result.ok ? {} : result.errors;
    return { ok: false, errors: { ...errors, sharers: "Choose at least one person to share." } };
  }
  return result.ok ? { ok: true, value: { ...result.value, sharerIds } } : result;
}

export const SHARER_FIELDS = ["name"] as const;

export function parseSharerForm(raw: Record<string, unknown>): Result<{ name: string }, "name"> {
  return run(z.object({ name: z.string().trim().min(1, "Enter a name.").max(40, "Use 40 characters or fewer.") }), raw, SHARER_FIELDS);
}

// --- Funds ------------------------------------------------------------

export const FUND_SPEND_FIELDS = ["amount", "spentOn", "purpose", "note"] as const;
export type FundSpendErrors = Partial<Record<(typeof FUND_SPEND_FIELDS)[number], string>>;

export function parseFundSpendForm(
  raw: Record<string, unknown>,
  today: string,
): Result<{ amountMinor: number; spentOn: string; purpose: FundPurpose; note: string }, (typeof FUND_SPEND_FIELDS)[number]> {
  const schema = z
    .object({
      amount: money,
      spentOn: pastDate(today),
      purpose: oneOf(Object.keys(FUND_PURPOSES) as FundPurpose[], "Choose what it was for."),
      note: note(100),
    })
    .transform((v) => ({ amountMinor: v.amount, spentOn: v.spentOn, purpose: v.purpose, note: v.note }));
  return run(schema, raw, FUND_SPEND_FIELDS);
}

// --- Students and fees -------------------------------------------------

const className = z.string().trim().max(20, "Use 20 characters or fewer.");

export const FEE_FIELDS = ["name", "amount"] as const;
export type FeeErrors = Partial<Record<(typeof FEE_FIELDS)[number], string>>;

export function parseFeeForm(raw: Record<string, unknown>): Result<{ name: string; amountMinor: number }, (typeof FEE_FIELDS)[number]> {
  const schema = z
    .object({ name: z.string().trim().min(1, "Enter a name, e.g. Mock 1 fees.").max(60, "Use 60 characters or fewer."), amount: moneyOrZero })
    .transform((v) => ({ name: v.name, amountMinor: v.amount }));
  return run(schema, raw, FEE_FIELDS);
}

export const STUDENTS_FIELDS = ["names", "className"] as const;
export type StudentsErrors = Partial<Record<(typeof STUDENTS_FIELDS)[number], string>>;

// One name per line; blank lines and repeats are dropped.
export function parseStudentsForm(
  raw: Record<string, unknown>,
): Result<{ names: string[]; className: string }, (typeof STUDENTS_FIELDS)[number]> {
  const schema = z.object({
    names: z
      .string()
      .transform((value) => [...new Set(value.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean))])
      .refine((names) => names.length > 0, "Enter at least one name, one per line.")
      .refine((names) => names.length <= 200, "Add at most 200 names at a time.")
      .refine((names) => names.every((name) => name.length <= 80), "Each name must be 80 characters or fewer."),
    className,
  });
  return run(schema, raw, STUDENTS_FIELDS);
}

export const PAYMENT_FIELDS = ["studentId", "newName", "newClass", "amount", "paidOn", "note"] as const;
export type PaymentErrors = Partial<Record<(typeof PAYMENT_FIELDS)[number], string>>;
export type PaymentValue = {
  student: { id: string } | { name: string; className: string };
  amountMinor: number;
  paidOn: string;
  note: string;
};

// A payment from a student on the list, or from a new student
// (studentId "new" with a name). With `allowZero`, the amount may be 0
// (books: the subjects are chosen first, paid later).
export function parsePaymentForm(
  raw: Record<string, unknown>,
  today: string,
  { allowZero = false }: { allowZero?: boolean } = {},
): Result<PaymentValue, (typeof PAYMENT_FIELDS)[number]> {
  const schema = z
    .object({
      studentId: z.string().refine((value) => value === "new" || z.uuid().safeParse(value).success, "Choose a student."),
      newName: z
        .string()
        .transform((value) => value.trim().replace(/\s+/g, " "))
        .refine((value) => value.length <= 80, "Use 80 characters or fewer."),
      newClass: className,
      amount: allowZero ? moneyOrZero : money,
      paidOn: pastDate(today),
      note: note(100),
    })
    .superRefine((v, context) => {
      if (v.studentId === "new" && v.newName === "") context.addIssue({ code: "custom", path: ["newName"], message: "Enter the student's name." });
    })
    .transform((v) => ({
      student: v.studentId === "new" ? { name: v.newName, className: v.newClass } : { id: v.studentId },
      amountMinor: v.amount,
      paidOn: v.paidOn,
      note: v.note,
    }));
  return run(schema, raw, PAYMENT_FIELDS);
}

export const PAYABLE_FIELDS = ["payable"] as const;

// What one student should pay; 0 is a full discount.
export function parsePayableForm(raw: Record<string, unknown>): Result<{ payableMinor: number }, "payable"> {
  return run(z.object({ payable: moneyOrZero }).transform((v) => ({ payableMinor: v.payable })), raw, PAYABLE_FIELDS);
}

export const HANDOVER_FIELDS = ["toWhom", "amount", "handedOn", "note"] as const;
export type HandoverErrors = Partial<Record<(typeof HANDOVER_FIELDS)[number], string>>;

export function parseHandoverForm(
  raw: Record<string, unknown>,
  today: string,
): Result<{ toWhom: Recipient; amountMinor: number; handedOn: string; note: string }, (typeof HANDOVER_FIELDS)[number]> {
  const schema = z
    .object({
      toWhom: oneOf(Object.keys(RECIPIENTS) as Recipient[], "Choose who received it."),
      amount: money,
      handedOn: pastDate(today),
      note: note(100),
    })
    .transform((v) => ({ toWhom: v.toWhom, amountMinor: v.amount, handedOn: v.handedOn, note: v.note }));
  return run(schema, raw, HANDOVER_FIELDS);
}

export const MY_PART_FIELDS = ["amount", "receivedOn", "note"] as const;
export type MyPartErrors = Partial<Record<(typeof MY_PART_FIELDS)[number], string>>;

export function parseMyPartForm(
  raw: Record<string, unknown>,
  today: string,
): Result<{ amountMinor: number; receivedOn: string; note: string }, (typeof MY_PART_FIELDS)[number]> {
  const schema = z
    .object({ amount: money, receivedOn: pastDate(today), note: note(100) })
    .transform((v) => ({ amountMinor: v.amount, receivedOn: v.receivedOn, note: v.note }));
  return run(schema, raw, MY_PART_FIELDS);
}

// --- Past questions books ----------------------------------------------

export const SUBJECT_FIELDS = ["name", "price"] as const;
export type SubjectErrors = Partial<Record<(typeof SUBJECT_FIELDS)[number], string>>;

export function parseSubjectForm(raw: Record<string, unknown>): Result<{ name: string; priceMinor: number }, (typeof SUBJECT_FIELDS)[number]> {
  const schema = z
    .object({ name: z.string().trim().min(1, "Enter a subject.").max(40, "Use 40 characters or fewer."), price: money })
    .transform((v) => ({ name: v.name, priceMinor: v.price }));
  return run(schema, raw, SUBJECT_FIELDS);
}

export const BOOK_SPLIT_FIELDS = ["transport", "mine"] as const;
export type BookSplitErrors = Partial<Record<(typeof BOOK_SPLIT_FIELDS)[number], string>>;

export function parseBookSplitForm(
  raw: Record<string, unknown>,
): Result<{ transportMinor: number; mineMinor: number }, (typeof BOOK_SPLIT_FIELDS)[number]> {
  const schema = z
    .object({ transport: moneyOrZero, mine: moneyOrZero })
    .transform((v) => ({ transportMinor: v.transport, mineMinor: v.mine }));
  return run(schema, raw, BOOK_SPLIT_FIELDS);
}

export const PURCHASE_FIELDS = ["subjectId", "quantity", "amount", "boughtOn", "note"] as const;
export type PurchaseErrors = Partial<Record<(typeof PURCHASE_FIELDS)[number], string>>;

export function parsePurchaseForm(
  raw: Record<string, unknown>,
  today: string,
): Result<{ subjectId: string; quantity: number; amountMinor: number; boughtOn: string; note: string }, (typeof PURCHASE_FIELDS)[number]> {
  const schema = z
    .object({
      subjectId: z.string().refine((value) => z.uuid().safeParse(value).success, "Choose a subject."),
      quantity: z
        .string()
        .trim()
        .refine((value) => /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 10000, "Enter how many, 1 to 10,000.")
        .transform(Number),
      amount: money,
      boughtOn: pastDate(today),
      note: note(100),
    })
    .transform((v) => ({ subjectId: v.subjectId, quantity: v.quantity, amountMinor: v.amount, boughtOn: v.boughtOn, note: v.note }));
  return run(schema, raw, PURCHASE_FIELDS);
}
