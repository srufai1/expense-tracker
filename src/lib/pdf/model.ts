import { dayLabel, formatMonth } from "../dates";
import { formatRateDate } from "../fx";
import { formatMoney } from "../money";
import type { Report } from "../reports/build";
import type { PeriodKind } from "../reports/periods";

// What the PDF shows (screen 10), as plain text, so it can be tested
// without reading a PDF file. report-document.tsx only lays it out. Every
// number comes from the same Report as the Reports screen (DESIGN §7).

// The built-in PDF font (Helvetica, WinAnsi) has no "−" (minus sign, used by
// formatMoney) or "→"; they would print as a wrong character.
export function pdfSafe(text: string): string {
  return text.replaceAll("−", "-").replaceAll("→", "->");
}

const HEADING: Record<PeriodKind, string> = { week: "Weekly report", month: "Monthly report", custom: "Report", year: "Year report" };
const NOUN: Record<PeriodKind, string> = { week: "week", month: "month", custom: "period", year: "year" };
const AVERAGE: Record<"week" | "month", string> = { week: "4-week average", month: "3-month average" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const STATUS = { over: "Over", watch: "Watch", ok: "OK" } as const;

export type ReportPdfModel = {
  heading: string;
  title: string;
  madeOn: string;
  summary: [string, string][];
  comparisons: string[];
  empty: string | null;
  chart: { title: string; bars: { label: string; heightPercent: number }[] };
  suggestions: string[];
  highlights: [string, string][];
  categories: { name: string; amount: string; share: string; child: boolean }[];
  budgets: { title: string; rows: { name: string; spent: string; budget: string; status: string; usedPercent: number }[] } | null;
  goals: { name: string; progress: string; needed: string | null }[];
};

export function reportPdfModel(report: Report, meta: { title: string; today: string; appName: string }): ReportPdfModel {
  const { period, totals, previous, average } = report;
  const ghs = (minor: number) => pdfSafe(formatMoney(minor, "GHS"));
  const day = (date: string) => dayLabel(date, meta.today);

  const comparisons = [
    `Previous ${NOUN[period.kind]}: ${ghs(previous.spendingMinor)} spent` +
      (previous.spendingChangePercent === null
        ? ""
        : ` (${previous.spendingChangePercent > 0 ? "+" : ""}${previous.spendingChangePercent}%)`),
  ];
  if (average && (period.kind === "week" || period.kind === "month")) {
    comparisons.push(
      `${AVERAGE[period.kind]}: ${average.status === "ok" ? `${ghs(average.spendingMinor)} spent` : "not enough history yet"}`,
    );
  }

  const max = Math.max(0, ...report.chart.map((bar) => bar.spendingMinor));
  const label = (index: number, first: string) => {
    if (period.kind === "week") return WEEKDAYS[index];
    if (period.kind === "year") return MONTH_LETTERS[index];
    return report.chart.length <= 14 || index % 7 === 0 ? String(Number(first.slice(8, 10))) : "";
  };

  const highlights: [string, string][] = [];
  if (report.mostSpentOn.length > 0) highlights.push(["Most spent on", report.mostSpentOn.join(", ")]);
  if (report.leastSpentOn.length > 0) highlights.push(["Least spent on", report.leastSpentOn.join(", ")]);
  if (report.biggestExpense) {
    const big = report.biggestExpense;
    highlights.push(["Biggest expense", `${ghs(big.amountGhsMinor)} · ${big.note || big.categoryLabel} · ${day(big.occurredOn)}`]);
  }
  if (report.busiestDay) {
    const busy = report.busiestDay;
    highlights.push([
      "Busiest day",
      `${day(busy.date)} · ${ghs(busy.spentMinor)} in ${busy.count} ${busy.count === 1 ? "expense" : "expenses"}`,
    ]);
  }
  if (report.fees.count > 0) highlights.push(["Fees", `${ghs(report.fees.totalMinor)} in ${report.fees.count}`]);

  const budgetLines = report.budgets?.lines ?? [];
  const budgetMonth = report.budgets ? formatMonth(report.budgets.month) : "";
  const asOf = report.budgets?.asOf;

  return {
    heading: HEADING[period.kind],
    title: meta.title,
    madeOn: `Made on ${formatRateDate(meta.today)} · ${meta.appName}`,
    summary: [
      ["Spent", ghs(totals.spendingMinor)],
      ["Income", ghs(totals.incomeMinor)],
      ["Net", ghs(totals.netMinor)],
      ["Saved", totals.savedPercent === null ? "—" : `${totals.savedPercent}%`],
    ],
    comparisons,
    empty:
      totals.spendingMinor === 0 && totals.incomeMinor === 0 ? `Nothing was recorded in this ${NOUN[period.kind]}.` : null,
    chart: {
      title: `Spending per ${report.chartUnit}`,
      bars: report.chart.map((bar, index) => ({
        label: label(index, bar.first),
        heightPercent: max === 0 ? 0 : Math.round((bar.spendingMinor * 100) / max),
      })),
    },
    suggestions: report.suggestions.map(pdfSafe),
    highlights,
    categories: report.categories.flatMap((line) => [
      { name: line.name, amount: ghs(line.spentMinor), share: `${line.sharePercent.toFixed(1)}%`, child: false },
      ...line.children.map((child) => ({
        name: child.name,
        amount: ghs(child.spentMinor),
        share: `${child.sharePercent.toFixed(1)}%`,
        child: true,
      })),
    ]),
    budgets:
      budgetLines.length === 0
        ? null
        : {
            title: asOf
              ? `Budgets · ${budgetMonth}, to ${formatRateDate(asOf).replace(/ \d{4}$/, "")}`
              : `Budgets · ${budgetMonth}`,
            rows: budgetLines.map((line) => ({
              name: line.label,
              spent: ghs(line.spentMinor),
              budget: ghs(line.budgetMinor),
              status: STATUS[line.status],
              usedPercent: line.usedPercent,
            })),
          },
    goals: report.goals.map((goal) => ({
      name: goal.name,
      progress: `${ghs(goal.savedMinor)} of ${ghs(goal.targetMinor)} (${goal.percent}%) by ${formatRateDate(goal.targetDate)}`,
      needed: goal.neededPerWeekMinor === null ? null : `Needs ${ghs(goal.neededPerWeekMinor)} a week`,
    })),
  };
}
