// Money rules from docs/DESIGN.md §5.
// Every amount is a whole number in the smallest unit (M-1):
// GHS 12.50 is 1250 pesewas, USD 9.99 is 999 cents.
// Floating-point numbers are never used for money: in JavaScript,
// 0.1 + 0.2 is not 0.3.

export const CURRENCIES = ["GHS", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// 999,999,999.99 — far above any personal amount, and well inside the range
// JavaScript and Postgres `bigint` store exactly.
export const MAX_AMOUNT_MINOR = 99_999_999_999;

export type ParseResult = { ok: true; minor: number } | { ok: false; error: string };

// Digits with optional thousands commas ("1,234") or none ("1234"), then an
// optional "." and decimals. The integer part may be empty (".5").
const AMOUNT_PATTERN = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

// Reads an amount the user typed. It never rounds: "12.345" is an error, not
// 12.35, because silently changing what someone typed hides mistakes.
export function parseAmount(
  text: string,
  { allowNegative = false, allowZero = false }: { allowNegative?: boolean; allowZero?: boolean } = {},
): ParseResult {
  let rest = text.trim();
  // "−" is the typographic minus some phone keyboards insert.
  const negative = rest.startsWith("-") || rest.startsWith("−");
  if (negative) rest = rest.slice(1);

  const match = AMOUNT_PATTERN.exec(rest);
  const whole = match?.[1].replace(/,/g, "") ?? "";
  const fraction = match?.[2] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    return { ok: false, error: "Enter an amount, for example 12.50." };
  }
  if (fraction.length > 2) {
    return { ok: false, error: "Use at most 2 decimal places." };
  }

  const size = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (negative && size !== 0 && !allowNegative) {
    return { ok: false, error: "The amount cannot be negative." };
  }
  if (size === 0 && !allowZero) {
    return { ok: false, error: "The amount must be more than 0." };
  }
  if (size > MAX_AMOUNT_MINOR) {
    return { ok: false, error: "The amount is too large." };
  }
  // `size === 0` avoids returning -0 for "-0".
  return { ok: true, minor: negative && size !== 0 ? -size : size };
}

// "GHS 1,234.56", "−USD 0.05" (M-9).
export function formatMoney(minor: number, currency: Currency): string {
  assertMinorUnits(minor);
  const size = Math.abs(minor);
  const whole = String(Math.floor(size / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = String(size % 100).padStart(2, "0");
  const text = `${currency} ${whole}.${cents}`;
  return minor < 0 ? `−${text}` : text;
}

// Rates are stored with up to 6 decimals (numeric(14,6) in the database).
const RATE_DECIMALS = 6;
const RATE_SCALE = BigInt(10 ** RATE_DECIMALS);
const RATE_PATTERN = /^(\d+)(?:\.(\d{1,6}))?$/;

// GHS value of an amount: amount × rate, rounded to the nearest pesewa,
// half away from zero (M-4). This is the only place money is rounded.
// `rate` is how many GHS for 1 unit of the amount's currency (M-3).
// The maths uses BigInt (exact whole numbers), never floats.
export function convertToGhs(minor: number, rate: string | number): number {
  assertMinorUnits(minor);
  const product = BigInt(minor) * parseRate(rate);

  const negative = product < BigInt(0);
  const size = negative ? -product : product;
  let result = size / RATE_SCALE; // BigInt division drops the remainder
  if ((size % RATE_SCALE) * BigInt(2) >= RATE_SCALE) result += BigInt(1);

  const value = Number(negative ? -result : result);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`convertToGhs: result ${value} is too large`);
  }
  return value;
}

// The rate as a whole number of millionths: "15.40" → 15400000.
function parseRate(rate: string | number): bigint {
  const match = RATE_PATTERN.exec(String(rate).trim());
  if (!match) throw new Error(`Invalid exchange rate: ${rate}`);
  const scaled = BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? "").padEnd(RATE_DECIMALS, "0"));
  if (scaled <= BigInt(0)) throw new Error(`Exchange rate must be above 0: ${rate}`);
  return scaled;
}

function assertMinorUnits(minor: number) {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Money must be whole minor units, got ${minor}`);
  }
}
