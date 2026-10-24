import "server-only";

import { requireUser } from "@/lib/auth";
import type { StoredRate } from "@/lib/fx";
import { createClient } from "@/lib/supabase/server";

// Stored USD→GHS rates, oldest first. One a day, so even years of them are
// small enough to send to the form, which picks the rate for any date (M-5).
export async function getRates(): Promise<StoredRate[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fx_rates")
    .select("rate_date, rate")
    .eq("base", "USD")
    .eq("quote", "GHS")
    .order("rate_date", { ascending: true });
  if (error) throw new Error(`Could not load exchange rates: ${error.message}`);
  return data.map(toStoredRate);
}

// The stored rate for a date, or else the latest earlier one (M-5).
export async function getRateFor(date: string): Promise<StoredRate | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fx_rates")
    .select("rate_date, rate")
    .eq("base", "USD")
    .eq("quote", "GHS")
    .lte("rate_date", date)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the exchange rate: ${error.message}`);
  return data ? toStoredRate(data) : null;
}

function toStoredRate(row: { rate_date: string; rate: number }): StoredRate {
  // numeric arrives as a JSON number; keep the 6 decimals the column has.
  return { rateDate: row.rate_date, rate: row.rate.toFixed(6) };
}
