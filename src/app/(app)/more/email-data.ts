import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The weekly email setting (on unless turned off, D-17), the address it
// goes to (the sign-in address, D-42) and the last week it was sent.
export async function getEmailSettings() {
  const user = await requireUser();
  const supabase = await createClient();
  const [settings, last] = await Promise.all([
    supabase.from("settings").select("weekly_email").maybeSingle(),
    supabase
      .from("report_emails")
      .select("week_start, status, sent_at")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (settings.error || last.error) throw new Error("Could not load the email settings.");
  return {
    on: settings.data?.weekly_email ?? true,
    address: user.email,
    last: last.data ? { weekStart: last.data.week_start, status: last.data.status } : null,
  };
}
