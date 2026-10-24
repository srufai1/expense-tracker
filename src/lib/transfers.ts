import { z } from "zod";

import { isIsoDate } from "./dates";
import { sameRate, type StoredRate } from "./fx";
import { convertToGhs, CURRENCIES, isValidRate, MAX_AMOUNT_MINOR, parseAmount, type Currency } from "./money";
import { safeConvert } from "./transactions";

// Transfers between the user's own accounts, with an optional fee
// (DESIGN §6.3, D-06, D-07, D-33). The database function save_transfer()
// writes the transfer and its fee together.

export type TransferInput = {
  fromAccountId: string;
  toAccountId: string;
  // Sent, in the sending account's currency.
  amountMinor: number;
  // Arrived, in the receiving account's currency. null: not typed (only
  // needed when the two currencies differ, D-33).
  receivedMinor: number | null;
  // Charged by the sending account, in its currency. null: no fee.
  feeMinor: number | null;
  occurredOn: string;
  // GHS for 1 USD, for a transfer from a USD account ("" otherwise).
  rate: string;
  note: string;
};

// The names of the fields in the transfer form, in screen order.
export const TRANSFER_FIELDS = [
  "fromAccountId",
  "toAccountId",
  "amount",
  "received",
  "fee",
  "occurredOn",
  "rate",
  "note",
] as const;
type Field = (typeof TRANSFER_FIELDS)[number];
export type TransferFormErrors = Partial<Record<Field, string>>;

function toMinor(text: string, context: z.RefinementCtx, allowZero = false): number {
  const result = parseAmount(text, { allowZero });
  if (!result.ok) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.minor;
}

const transferFormSchema = z.object({
  fromAccountId: z.uuid({ error: "Choose the account the money leaves." }),
  toAccountId: z.uuid({ error: "Choose the account the money goes to." }),
  amount: z.string().transform((text, context) => toMinor(text, context)),
  // Empty means "not typed".
  received: z.string().transform((text, context) => (text.trim() === "" ? null : toMinor(text, context))),
  // Empty or 0 means "no fee".
  fee: z.string().transform((text, context) => (text.trim() === "" ? null : toMinor(text, context, true) || null)),
  occurredOn: z.string().refine(isIsoDate, "Enter a real date."),
  rate: z
    .string()
    .trim()
    .refine((text) => text === "" || isValidRate(text), "Enter a rate above 0 with at most 6 decimals, e.g. 11.67."),
  note: z.string().trim().max(200, "Use 200 characters or fewer."),
});

// One rule set for the transfer form: the browser and the Server Action
// both run it, and the database checks again.
export function parseTransferForm(
  raw: Record<string, unknown>,
): { ok: true; value: TransferInput } | { ok: false; errors: TransferFormErrors } {
  const text = Object.fromEntries(
    TRANSFER_FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""]),
  );
  const result = transferFormSchema.safeParse(text);
  if (!result.success) {
    const errors: TransferFormErrors = {};
    for (const issue of result.error.issues) {
      errors[issue.path[0] as Field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { amount, received, fee, ...rest } = result.data;
  if (rest.fromAccountId === rest.toAccountId) {
    return { ok: false, errors: { toAccountId: "Choose a different account to move the money to." } };
  }
  return { ok: true, value: { ...rest, amountMinor: amount, receivedMinor: received, feeMinor: fee } };
}

// The arguments of save_transfer(), named as the database function names them.
export type TransferArgs = {
  p_id: string | null;
  p_occurred_on: string;
  p_from_account_id: string;
  p_to_account_id: string;
  p_amount_minor: number;
  p_to_amount_minor: number;
  p_currency: Currency;
  p_fx_rate: string;
  p_fx_source: "none" | "auto" | "manual";
  p_fx_rate_date: string | null;
  p_amount_ghs_minor: number;
  p_fee_minor: number | null;
  p_fee_ghs_minor: number | null;
  p_note: string;
};

// Builds save_transfer()'s arguments from the form and the two accounts'
// currencies. The transfer is in the sending account's currency. From a USD
// account, a rate gives the GHS values: "auto" when it is the stored rate
// for the date (M-5), "manual" when typed. `id`: the transfer being changed.
export function buildTransferArgs(
  input: TransferInput,
  fromCurrency: Currency,
  toCurrency: Currency,
  stored: StoredRate | null,
  id: string | null = null,
): { ok: true; args: TransferArgs } | { ok: false; errors: TransferFormErrors } {
  const sameCurrency = fromCurrency === toCurrency;
  if (!sameCurrency && input.receivedMinor === null) {
    return { ok: false, errors: { received: `Enter the amount that arrived, in ${toCurrency}.` } };
  }

  const usd = fromCurrency === "USD";
  if (usd && input.rate === "") {
    return { ok: false, errors: { rate: "Enter the exchange rate: how many GHS for 1 USD." } };
  }
  const toGhs = (minor: number) => (usd ? safeConvert(() => convertToGhs(minor, input.rate)) : minor);

  const amountGhs = toGhs(input.amountMinor);
  if (amountGhs === null) return { ok: false, errors: { amount: "The amount is too large." } };
  const feeGhs = input.feeMinor === null ? null : toGhs(input.feeMinor);
  if (input.feeMinor !== null && feeGhs === null) return { ok: false, errors: { fee: "The fee is too large." } };

  const auto = usd && stored !== null && sameRate(input.rate, stored.rate);
  return {
    ok: true,
    args: {
      p_id: id,
      p_occurred_on: input.occurredOn,
      p_from_account_id: input.fromAccountId,
      p_to_account_id: input.toAccountId,
      p_amount_minor: input.amountMinor,
      p_to_amount_minor: sameCurrency ? input.amountMinor : (input.receivedMinor as number),
      p_currency: fromCurrency,
      p_fx_rate: usd ? input.rate : "1",
      p_fx_source: usd ? (auto ? "auto" : "manual") : "none",
      p_fx_rate_date: auto ? stored.rateDate : null,
      p_amount_ghs_minor: amountGhs,
      p_fee_minor: input.feeMinor,
      p_fee_ghs_minor: feeGhs,
      p_note: input.note,
    },
  };
}

// D-33: the rate a transfer between currencies implies, e.g. "GHS 11.50 per
// USD". Display only, to 4 decimals (at least 2); never used for money.
export function impliedRate(
  sentMinor: number | null,
  sentCurrency: Currency,
  receivedMinor: number | null,
  receivedCurrency: Currency,
): string | null {
  if (sentCurrency === receivedCurrency || !sentMinor || !receivedMinor) return null;
  const [ghs, usd] = sentCurrency === "GHS" ? [sentMinor, receivedMinor] : [receivedMinor, sentMinor];
  // GHS per USD × 10,000, rounded half up (both amounts are positive).
  const scaled = (BigInt(ghs) * BigInt(20_000) + BigInt(usd)) / (BigInt(usd) * BigInt(2));
  const whole = scaled / BigInt(10_000);
  const decimals = String(scaled % BigInt(10_000)).padStart(4, "0").replace(/0{1,2}$/, "");
  return `GHS ${whole}.${decimals} per USD`;
}

// A deleted transfer with its fee, to put back with Undo (D-26). It comes
// from the browser, so it is checked again; the database checks it too.
const snapshotSchema = z.object({
  p_id: z.uuid(),
  p_occurred_on: z.string().refine(isIsoDate),
  p_from_account_id: z.uuid(),
  p_to_account_id: z.uuid(),
  p_amount_minor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
  p_to_amount_minor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
  p_currency: z.enum(CURRENCIES),
  p_fx_rate: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,6})?$/)]),
  p_fx_source: z.enum(["none", "auto", "manual"]),
  p_fx_rate_date: z.string().refine(isIsoDate).nullable(),
  p_amount_ghs_minor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  p_fee_minor: z.number().int().min(1).max(MAX_AMOUNT_MINOR).nullable(),
  p_fee_ghs_minor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).nullable(),
  p_note: z.string().max(200),
  // The recurring link, put back after save_transfer (build step 7).
  recurring_rule_id: z.uuid().nullable(),
  occurrence_date: z.string().refine(isIsoDate).nullable(),
});
export type TransferSnapshot = z.infer<typeof snapshotSchema>;

export function parseTransferSnapshot(value: unknown): TransferSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

// A database refusal on save, turned into a message for the right field.
// null: not about the form (for example no connection).
export function transferSaveError(code: string | undefined, message: string): TransferFormErrors | null {
  if (message.includes("account not found") || message.includes("_account_id_fkey")) {
    return { fromAccountId: "Choose both accounts from the list." };
  }
  if (message.includes("transactions_transfer_two_accounts")) {
    return { toAccountId: "Choose a different account to move the money to." };
  }
  // An account's currency changed between reading it and saving.
  if (code === "23514" && (message.includes("account it leaves") || message.includes("receives the amount sent"))) {
    return { fromAccountId: "An account's currency has changed. Choose the accounts again." };
  }
  return null;
}
