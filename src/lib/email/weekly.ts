import { formatMonth } from "../dates";
import { formatMoney } from "../money";
import type { Report } from "../reports/build";

// The Monday email (screen 9, D-17, D-27): the week's summary, budget
// alerts and the top 3 suggestions, with the PDF attached. The numbers
// come from the same Report as the screen and the PDF.

const TOP_SUGGESTIONS = 3;
const ghs = (minor: number) => formatMoney(minor, "GHS");

// Category, goal and other names are typed by the user: never put them in
// HTML without escaping.
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function weeklyEmail(report: Report, meta: { title: string; appName: string }) {
  const { totals } = report;
  const empty = totals.spendingMinor === 0 && totals.incomeMinor === 0;
  const heading = `Your week: ${meta.title}`;
  const summary: [string, string][] = [
    ["Spent", ghs(totals.spendingMinor)],
    ["Income", ghs(totals.incomeMinor)],
    ["Net", ghs(totals.netMinor)],
    ["Saved", totals.savedPercent === null ? "—" : `${totals.savedPercent}%`],
  ];
  const alerts = (report.budgets?.lines ?? [])
    .filter((line) => line.status !== "ok")
    .map(
      (line) =>
        `${line.label}: ${line.status === "over" ? "over budget" : `${line.usedPercent}% used`}, ${ghs(line.spentMinor)} of ${ghs(line.budgetMinor)}`,
    );
  const budgetTitle = report.budgets ? `Budgets (${formatMonth(report.budgets.month)})` : "Budgets";
  const tips = report.suggestions.slice(0, TOP_SUGGESTIONS);
  const attached = "The full report is attached as a PDF.";
  const footer = `Sent by ${meta.appName}. You can turn this email off in More → Weekly email.`;

  const text: string[] = [heading, ""];
  if (empty) text.push("Nothing recorded this week.", "");
  else text.push(...summary.map(([label, value]) => `${label}: ${value}`), "");
  if (alerts.length > 0) text.push(`${budgetTitle}:`, ...alerts.map((a) => `- ${a}`), "");
  if (tips.length > 0) text.push("Suggestions:", ...tips.map((t) => `- ${t}`), "");
  text.push(attached, "", footer);

  const p = 'style="margin:0 0 12px"';
  const h2 = 'style="font-size:13px;color:#5F6B66;text-transform:uppercase;margin:20px 0 8px"';
  const list = (items: string[]) =>
    `<ul style="margin:0;padding-left:20px">${items.map((item) => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`).join("")}</ul>`;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#151917;max-width:560px">',
    `<h1 style="font-size:20px;color:#0B5D4B;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    empty
      ? `<p ${p}>Nothing recorded this week.</p>`
      : `<table style="border-collapse:collapse;margin:0 0 12px">${summary
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 16px 4px 0;color:#5F6B66">${label}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
          )
          .join("")}</table>`,
    alerts.length > 0 ? `<h2 ${h2}>${escapeHtml(budgetTitle)}</h2>${list(alerts)}` : "",
    tips.length > 0 ? `<h2 ${h2}>Suggestions</h2>${list(tips)}` : "",
    `<p style="margin:20px 0 12px">${attached}</p>`,
    `<p style="margin:0;font-size:12px;color:#5F6B66">${escapeHtml(footer)}</p>`,
    "</div>",
  ].join("");

  return { subject: empty ? `${heading} · nothing recorded` : heading, text: text.join("\n"), html };
}

// Who gets this week's email: every user with an email address whose
// weekly email is on (it is on unless they turned it off, D-17), and whose
// week has no log row yet or a "failed" one (§6.8). "sending" means a run
// claimed it and may have sent it: never sent again automatically.
export function weeklyRecipients(
  users: { id: string; email: string | null }[],
  settings: { userId: string; weeklyEmail: boolean }[],
  logged: { userId: string; status: "sending" | "sent" | "failed" }[],
): { id: string; email: string }[] {
  const off = new Set(settings.filter((s) => !s.weeklyEmail).map((s) => s.userId));
  const sent = new Set(logged.filter((l) => l.status !== "failed").map((l) => l.userId));
  return users
    .filter((user): user is { id: string; email: string } => user.email !== null && user.email !== "")
    .filter((user) => !off.has(user.id) && !sent.has(user.id));
}
