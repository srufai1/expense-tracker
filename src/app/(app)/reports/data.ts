import "server-only";

import { requireUser } from "@/lib/auth";
import { buildReport, type Report } from "@/lib/reports/build";
import { loadReportInput } from "@/lib/reports/load";
import type { Period } from "@/lib/reports/periods";
import { createClient } from "@/lib/supabase/server";

// One report (DESIGN §7) for the signed-in user. The same loader feeds the
// Monday email, so the screen, the PDF and the email always agree.
export async function getReport(period: Period, today: string): Promise<Report> {
  const user = await requireUser();
  const supabase = await createClient();
  return buildReport(await loadReportInput(supabase, user.id, period, today));
}
