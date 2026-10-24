import { connection } from "next/server";

import { isCronAuthorized } from "@/lib/cron";
import { todayInAccra } from "@/lib/dates";
import { fetchDailyRate, RATE_SOURCE } from "@/lib/fx";
import { createAdminClient } from "@/lib/supabase/admin";

import { runRecurring } from "./recurring";
import { runWeeklyEmail } from "./weekly-email";

// The daily job (DESIGN §3), run by Vercel Cron (vercel.json). Each task is
// safe to run twice, and a failing task does not stop the next one.
export async function GET(request: Request) {
  // Always run per request, never at build time.
  await connection();
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: Record<string, string> = {};

  // 1. Today's USD→GHS rate (D-35). Stored under the provider's own date;
  //    running twice only refreshes the same row.
  const fetched = await fetchDailyRate(fetch);
  if (fetched.ok) {
    const { error } = await supabase.from("fx_rates").upsert(
      {
        rate_date: fetched.rateDate,
        base: "USD",
        quote: "GHS",
        rate: fetched.rate,
        source: RATE_SOURCE,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "rate_date,base,quote" },
    );
    results.rate = error ? `failed to save: ${error.message}` : `saved ${fetched.rate} for ${fetched.rateDate}`;
  } else {
    results.rate = `failed: ${fetched.error}`;
  }

  // 2. Recurring items due up to today, in Accra (§6.6). Runs after the
  //    rate, so a USD item due today can use today's rate.
  results.recurring = await runRecurring(supabase, todayInAccra());

  // 3. Last week's report by email, with the PDF (D-17). Sent once per
  //    week (the log); a missed or failed Monday is sent on the next run.
  results.email = await runWeeklyEmail(supabase, todayInAccra(), process.env.RESEND_API_KEY);

  const failed = Object.values(results).some((result) => result.startsWith("failed"));
  return Response.json(results, { status: failed ? 500 : 200 });
}
