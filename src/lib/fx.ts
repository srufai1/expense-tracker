import { z } from "zod";

import { formatDate } from "./dates";
import { isValidRate } from "./money";

// Exchange rates (DESIGN §6.4, M-5, M-6, D-35). A rate is how many GHS for
// 1 USD, kept as text with up to 6 decimals, like the database column.
export type StoredRate = { rateDate: string; rate: string };

export const RATE_SOURCE = "open.er-api.com";
export const RATE_SERVICE_URL = "https://open.er-api.com/v6/latest/USD";
export const RATE_ATTRIBUTION = { label: "Rates by Exchange Rate API", href: "https://www.exchangerate-api.com" };

// M-5: the rate stored for the date, or else the latest earlier one.
// null when there is none (M-6: then the user types the rate).
export function pickRate(rates: StoredRate[], date: string): StoredRate | null {
  let best: StoredRate | null = null;
  for (const rate of rates) {
    if (rate.rateDate <= date && (best === null || rate.rateDate > best.rateDate)) best = rate;
  }
  return best;
}

// "24 Oct 2026": how a rate's date is shown (the app's one date format).
export function formatRateDate(date: string): string {
  return formatDate(date);
}

// The line under the rate field: which day's rate it is, as M-5 asks.
export function rateHint(picked: StoredRate | null, date: string): string {
  if (picked === null) return "No exchange rate is stored for this date. Type the rate you got.";
  if (picked.rateDate === date) return `Rate for ${formatRateDate(picked.rateDate)}.`;
  return `Rate from ${formatRateDate(picked.rateDate)}, the latest stored before this date.`;
}

// "11.65" and "11.650000" are the same rate.
export function sameRate(a: string | number, b: string | number): boolean {
  return isValidRate(a) && isValidRate(b) && millionths(a) === millionths(b);
}

function millionths(rate: string | number): bigint {
  const [whole, fraction = ""] = String(rate).trim().split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
}

const erApiReply = z.object({
  result: z.literal("success"),
  base_code: z.literal("USD"),
  time_last_update_unix: z.number().int().positive(),
  rates: z.object({ GHS: z.number().positive() }),
});

// Reads the reply of open.er-api.com/v6/latest/USD. The rate is stored under
// the provider's own update date (D-35); Accra is UTC+0.
export function parseErApiResponse(
  reply: unknown,
): { ok: true; rateDate: string; rate: string } | { ok: false; error: string } {
  const result = erApiReply.safeParse(reply);
  if (!result.success) return { ok: false, error: "The rate service sent an unexpected reply." };
  const rateDate = new Date(result.data.time_last_update_unix * 1000).toISOString().slice(0, 10);
  // A rate is not money: rounding it to the 6 decimals the database keeps is fine.
  const rate = result.data.rates.GHS.toFixed(6);
  if (!isValidRate(rate)) return { ok: false, error: "The rate service sent an unusable rate." };
  return { ok: true, rateDate, rate };
}

// Fetches today's USD→GHS rate (D-35). `fetchFn` is the global fetch in the
// app and a fake in tests. Never throws: the daily job reports a failure
// and carries on with its other tasks (M-6: the app keeps working).
export async function fetchDailyRate(
  fetchFn: typeof fetch,
): Promise<{ ok: true; rateDate: string; rate: string } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(RATE_SERVICE_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ok: false, error: `The rate service answered ${response.status}.` };
    return parseErApiResponse(await response.json());
  } catch (error) {
    return { ok: false, error: `The rate service could not be reached: ${(error as Error).message}` };
  }
}
