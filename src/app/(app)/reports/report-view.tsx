import { Lightbulb } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { dayLabel, formatMonth } from "@/lib/dates";
import { formatRateDate } from "@/lib/fx";
import { formatMoney } from "@/lib/money";
import type { Report } from "@/lib/reports/build";
import type { Period } from "@/lib/reports/periods";
import { cn } from "@/lib/utils";

import { MoneyText } from "../accounts/money-text";
import { BudgetBar } from "../budgets/budget-bar";

// Screen 5: everything comes from the Report that buildReport() made, so
// the screen, the PDF and the email show the same numbers (DESIGN §7).

const NOUN: Record<Period["kind"], string> = { week: "week", month: "month", custom: "period", year: "year" };
const AVERAGE: Record<"week" | "month", string> = { week: "4-week average", month: "3-month average" };
const ghs = (minor: number) => formatMoney(minor, "GHS");
const signed = (percent: number) => (percent > 0 ? `+${percent}%` : percent < 0 ? `−${-percent}%` : "0%");

export function ReportView({ report, today }: { report: Report; today: string }) {
  const { totals, period } = report;
  const empty = totals.spendingMinor === 0 && totals.incomeMinor === 0;
  return (
    <>
      <Summary report={report} />
      {empty ? (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          Nothing was recorded in this {NOUN[period.kind]}.
        </p>
      ) : (
        <>
          <Chart report={report} today={today} />
          <Suggestions items={report.suggestions} />
          <Highlights report={report} today={today} />
          <Categories report={report} />
        </>
      )}
      <Budgets report={report} />
      <Goals report={report} />
    </>
  );
}

function Section({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label ?? title}>
      <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ report }: { report: Report }) {
  const { totals, previous, average, period } = report;
  const change = previous.spendingChangePercent;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4" aria-label="Summary">
      <div className="grid grid-cols-2 gap-3">
        <Figure label="Spent">
          <MoneyText minor={totals.spendingMinor} currency="GHS" className="text-xl font-extrabold" />
        </Figure>
        <Figure label="Income">
          <MoneyText minor={totals.incomeMinor} currency="GHS" className="text-xl font-extrabold text-primary" />
        </Figure>
        <Figure label="Net">
          <MoneyText minor={totals.netMinor} currency="GHS" className="text-lg font-bold" />
        </Figure>
        <Figure label="Saved">
          <span className="text-lg font-bold tabular-nums">
            {totals.savedPercent === null ? "—" : `${totals.savedPercent}%`}
          </span>
        </Figure>
      </div>
      <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Previous {NOUN[period.kind]}</dt>
          <dd className="text-right tabular-nums">
            {ghs(previous.spendingMinor)} spent
            {change === null ? null : (
              <span className={cn("ml-1 font-semibold", change > 0 ? "text-destructive" : "text-primary")}>
                ({signed(change)})
              </span>
            )}
          </dd>
        </div>
        {average === null || (period.kind !== "week" && period.kind !== "month") ? null : (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{AVERAGE[period.kind]}</dt>
            <dd className="text-right tabular-nums">
              {average.status === "ok" ? `${ghs(average.spendingMinor)} spent` : "not enough history yet"}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// The label under a bar; long charts label every 7th bar only.
function barLabel(report: Report, index: number): string {
  const bucket = report.chart[index];
  if (report.period.kind === "week") return WEEKDAYS[index];
  if (report.period.kind === "year") return MONTH_LETTERS[index];
  const every = report.chart.length > 14 ? 7 : 1;
  return index % every === 0 ? String(Number(bucket.first.slice(8, 10))) : "";
}

function Chart({ report, today }: { report: Report; today: string }) {
  const bars = report.chart;
  const max = Math.max(...bars.map((bar) => bar.spendingMinor));
  const top = bars.find((bar) => bar.spendingMinor === max);
  const unit = report.period.kind === "year" ? "month" : bars.length > 0 && bars[0].first !== bars[0].last ? "week" : "day";
  const topName =
    top && unit === "month" ? formatMonth(top.first.slice(0, 7)) : top ? dayLabel(top.first, today) : "";
  return (
    <Section title={`Spending per ${unit}`}>
      <div className="rounded-2xl border bg-card p-4">
        <div
          className="flex h-32 items-end gap-0.5"
          role="img"
          aria-label={max > 0 ? `Spending per ${unit}. Highest: ${ghs(max)}, ${unit === "week" ? "week of " : ""}${topName}.` : `No spending this ${NOUN[report.period.kind]}.`}
        >
          {bars.map((bar) => (
            <span key={bar.first} className="flex h-full min-w-0 flex-1 items-end">
              <span
                className={cn("w-full rounded-t-sm", bar.spendingMinor > 0 ? "bg-primary" : "bg-muted")}
                style={{ height: max > 0 && bar.spendingMinor > 0 ? `${Math.max(3, Math.round((bar.spendingMinor * 100) / max))}%` : "3%" }}
              />
            </span>
          ))}
        </div>
        <div className="mt-1 flex gap-0.5" aria-hidden="true">
          {bars.map((bar, index) => (
            <span key={bar.first} className="min-w-0 flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-muted-foreground">
              {barLabel(report, index)}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Suggestions({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Section title="Suggestions">
      <ul className="flex flex-col gap-2">
        {items.map((text) => (
          <li key={text} className="flex gap-3 rounded-2xl border bg-card p-4 text-sm">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Highlights({ report, today }: { report: Report; today: string }) {
  const rows: [string, ReactNode][] = [];
  if (report.mostSpentOn.length > 0) rows.push(["Most spent on", report.mostSpentOn.join(", ")]);
  if (report.leastSpentOn.length > 0) rows.push(["Least spent on", report.leastSpentOn.join(", ")]);
  if (report.biggestExpense) {
    const big = report.biggestExpense;
    rows.push([
      "Biggest expense",
      <Link key="big" href={`/activity/${big.id}`} className="underline underline-offset-2">
        {ghs(big.amountGhsMinor)} · {big.note || big.categoryLabel} · {dayLabel(big.occurredOn, today)}
      </Link>,
    ]);
  }
  if (report.busiestDay) {
    const day = report.busiestDay;
    rows.push([
      "Busiest day",
      `${dayLabel(day.date, today)} · ${ghs(day.spentMinor)} in ${day.count} ${day.count === 1 ? "expense" : "expenses"}`,
    ]);
  }
  if (report.fees.count > 0) rows.push(["Fees", `${ghs(report.fees.totalMinor)} in ${report.fees.count}`]);
  if (rows.length === 0) return null;
  return (
    <Section title="Highlights">
      <dl className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-12 flex-col justify-center gap-0.5 px-4 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Categories({ report }: { report: Report }) {
  if (report.categories.length === 0) return null;
  return (
    <Section title="Where the money went">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {report.categories.map((line) => (
          <li key={line.categoryId} className="flex flex-col gap-2 px-4 py-3">
            <ShareRow name={line.name} spentMinor={line.spentMinor} sharePercent={line.sharePercent} bold />
            {line.children.map((child) => (
              <ShareRow key={child.categoryId} name={child.name} spentMinor={child.spentMinor} sharePercent={child.sharePercent} />
            ))}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ShareRow({ name, spentMinor, sharePercent, bold = false }: { name: string; spentMinor: number; sharePercent: number; bold?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", !bold && "pl-4")}>
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className={cn("min-w-0 break-words", bold ? "font-bold" : "text-muted-foreground")}>{name}</span>
        <span className="shrink-0 tabular-nums">
          <span className={cn(bold && "font-semibold")}>{ghs(spentMinor)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{sharePercent.toFixed(1)}%</span>
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={cn("block h-full rounded-full", bold ? "bg-primary" : "bg-primary/50")} style={{ width: `${sharePercent}%` }} />
      </span>
    </div>
  );
}

function Budgets({ report }: { report: Report }) {
  const budgets = report.budgets;
  if (!budgets || budgets.lines.length === 0) return null;
  const month = formatMonth(budgets.month);
  // "Budgets · October 2026, to 24 Oct" (month-to-date, §7.3).
  const title = budgets.asOf
    ? `Budgets · ${month}, to ${formatRateDate(budgets.asOf).replace(/ \d{4}$/, "")}`
    : `Budgets · ${month}`;
  return (
    <Section title={title} label="Budgets">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {budgets.lines.map((line) => (
          <li key={line.categoryId}>
            <BudgetBar line={line} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Goals({ report }: { report: Report }) {
  if (report.goals.length === 0) return null;
  return (
    <Section title="Goals">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {report.goals.map((goal) => (
          <li key={goal.id}>
            <Link
              href={`/goals/${goal.id}`}
              className="flex flex-col gap-1 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 font-bold break-words">{goal.name}</span>
                <span className="shrink-0 tabular-nums">{goal.percent}%</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {ghs(goal.savedMinor)} of {ghs(goal.targetMinor)} by {formatRateDate(goal.targetDate)}
                {goal.neededPerWeekMinor === null ? "" : ` · needs ${ghs(goal.neededPerWeekMinor)} a week`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
