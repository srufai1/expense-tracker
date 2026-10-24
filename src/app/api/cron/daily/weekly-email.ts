import "server-only";

import { appConfig } from "@/config/app";
import { sendWithResend } from "@/lib/email/resend";
import { weeklyEmail, weeklyRecipients } from "@/lib/email/weekly";
import { reportPdfModel } from "@/lib/pdf/model";
import { renderReportPdf } from "@/lib/pdf/report-document";
import { buildReport } from "@/lib/reports/build";
import { loadReportInput } from "@/lib/reports/load";
import { downloadName, periodTitle } from "@/lib/reports/params";
import { addDays, periodFor } from "@/lib/reports/periods";
import type { createAdminClient } from "@/lib/supabase/admin";

// Task 3 of the daily job: last week's report by email, with the PDF
// (D-17, D-27, D-34). It runs every day: the log (report_emails) means a
// week is sent once, and a run that failed or was missed (for example on
// Monday) sends it on the next day. The logic lives in src/lib (tested);
// this only reads, sends and writes the log.
export async function runWeeklyEmail(
  supabase: ReturnType<typeof createAdminClient>,
  today: string,
  apiKey: string | undefined,
): Promise<string> {
  if (!apiKey) return "skipped: RESEND_API_KEY is not set";
  const period = periodFor("week", addDays(today, -7));
  const title = periodTitle(period);

  const users: { id: string; email: string | null }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return `failed: could not list users: ${error.message}`;
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email ?? null })));
    if (data.users.length < 1000) break;
  }
  const [settings, logged] = await Promise.all([
    supabase.from("settings").select("user_id, weekly_email"),
    supabase.from("report_emails").select("user_id, status").eq("week_start", period.first),
  ]);
  if (settings.error || logged.error) return "failed: could not read the settings or the email log";

  const recipients = weeklyRecipients(
    users,
    settings.data.map((row) => ({ userId: row.user_id, weeklyEmail: row.weekly_email })),
    logged.data.map((row) => ({ userId: row.user_id, status: row.status })),
  );
  if (recipients.length === 0) return `nothing to send for ${title}`;

  const problems: string[] = [];
  let sent = 0;
  for (const user of recipients) {
    // Claim the week first (see the migration): another run may be sending
    // it at this moment. Only the run that changed a row goes on.
    const claimed = await claimWeek(supabase, user.id, period.first);
    if (claimed === "error") {
      problems.push(`${user.id}: could not claim the week`);
      continue;
    }
    if (!claimed) continue;

    let result: { ok: true } | { ok: false; error: string };
    try {
      // Filtered by user_id inside: this client has no RLS.
      const report = buildReport(await loadReportInput(supabase, user.id, period, today));
      const pdf = await renderReportPdf(reportPdfModel(report, { title, today, appName: appConfig.name }));
      result = await sendWithResend(fetch, apiKey, {
        from: appConfig.emailFrom,
        to: user.email,
        ...weeklyEmail(report, { title, appName: appConfig.name }),
        attachments: [{ filename: downloadName(period, "pdf"), content: pdf }],
        idempotencyKey: `weekly-report/${user.id}/${period.first}`,
      });
    } catch (error) {
      result = { ok: false, error: (error as Error).message };
    }
    // If this write fails, the row stays "sending": never sent twice.
    const { error: logError } = await supabase
      .from("report_emails")
      .update({
        status: result.ok ? "sent" : "failed",
        sent_at: result.ok ? new Date().toISOString() : null,
        error: result.ok ? "" : result.error.slice(0, 500),
      })
      .eq("user_id", user.id)
      .eq("week_start", period.first);
    if (result.ok) sent += 1;
    else problems.push(`${user.id}: ${result.error}`);
    if (logError) problems.push(`${user.id}: could not log the email: ${logError.message}`);
  }

  const summary = `sent ${sent} of ${recipients.length} email(s) for ${title}`;
  return problems.length > 0 ? `failed: ${summary}; problems: ${problems.join("; ")}` : summary;
}

// true: this run owns the week and may send it. false: another run has it
// (or it is already sent). The insert does nothing if the row exists; the
// update only moves "failed" to "sending". Each is one statement, so two
// runs at once cannot both win.
async function claimWeek(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  weekStart: string,
): Promise<boolean | "error"> {
  const inserted = await supabase
    .from("report_emails")
    .upsert({ user_id: userId, week_start: weekStart, status: "sending", sent_at: null }, {
      onConflict: "user_id,week_start",
      ignoreDuplicates: true,
    })
    .select("user_id");
  if (inserted.error) return "error";
  if (inserted.data.length > 0) return true;
  const retried = await supabase
    .from("report_emails")
    .update({ status: "sending", error: "" })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("status", "failed")
    .select("user_id");
  if (retried.error) return "error";
  return retried.data.length > 0;
}
