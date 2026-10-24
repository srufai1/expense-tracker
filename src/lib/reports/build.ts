import { budgetLines, spendingByCategory, type BudgetLine, type BudgetRow } from "../budgets";
import { categoryPath, type CategoryRow } from "../categories";
import { formatMonth, monthBounds } from "../dates";
import { formatRateDate } from "../fx";
import { goalProgress } from "../goals";
import { divideRounded, formatMoney } from "../money";
import {
  addDays,
  averageWindows,
  budgetMonthFor,
  chartBuckets,
  chartUnit,
  daysBetween,
  previousPeriod,
  weekday,
  type DateRange,
  type Period,
} from "./periods";
import * as T from "./thresholds";

// The one report engine (DESIGN §7): the screens, the PDF, the Excel file
// and the email all show its output, so they can never disagree. Pure: the
// caller loads the data (see dataRange) and passes it in. Amounts are GHS
// pesewas (M-2).

export type ReportTransaction = {
  id: string;
  kind: "expense" | "income" | "transfer";
  occurredOn: string;
  categoryId: string | null;
  amountGhsMinor: number;
  note: string;
};

export type ReportGoal = {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string;
  archived: boolean;
  contributions: { occurredOn: string; amountMinor: number }[];
};

export type ReportInput = {
  period: Period;
  today: string;
  // At least the dates of dataRange(period, today); more is fine.
  transactions: ReportTransaction[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  goals: ReportGoal[];
  // The date of the user's first transaction, or null without any. An
  // average needs history from before its first window (§7.2).
  historyStartsOn: string | null;
};

export type CategoryShare = { categoryId: string; name: string; spentMinor: number; sharePercent: number };
export type CategoryLine = CategoryShare & { children: CategoryShare[] };

export type GoalLine = {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string;
  savedMinor: number;
  percent: number;
  // What it needs per week to reach the target by its date; null when
  // reached or when the date has passed.
  neededPerWeekMinor: number | null;
  // The average per week over the last 4 weeks.
  recentWeeklyMinor: number;
};

export type Report = {
  period: Period;
  // The last day counted: the period's last day, or today if earlier.
  asOf: string;
  // True once the period is over (today is after its last day).
  finished: boolean;
  totals: { spendingMinor: number; incomeMinor: number; netMinor: number; savedPercent: number | null };
  categories: CategoryLine[];
  mostSpentOn: string[];
  leastSpentOn: string[];
  biggestExpense: { id: string; occurredOn: string; amountGhsMinor: number; categoryLabel: string; note: string } | null;
  busiestDay: { date: string; spentMinor: number; count: number } | null;
  fees: { count: number; totalMinor: number };
  chart: (DateRange & { spendingMinor: number; incomeMinor: number })[];
  // What one bar covers (§7.2).
  chartUnit: "day" | "week" | "month";
  previous: { period: Period; spendingMinor: number; incomeMinor: number; spendingChangePercent: number | null };
  // null: this kind of period has no average (custom, year).
  average:
    | { status: "ok"; periods: number; spendingMinor: number; incomeMinor: number }
    | { status: "not_enough_history"; periods: number }
    | null;
  budgets: { month: string; asOf: string | null; lines: BudgetLine[] } | null;
  goals: GoalLine[];
  // Weekly reports only: days up to yesterday with nothing recorded (S-8).
  daysWithoutRecords: string[];
  suggestions: string[];
  // For the suggestions: spending per category (top-level and sub) in the
  // period and on average.
  categoryAverages: { categoryId: string; name: string; spentMinor: number; averageMinor: number }[];
};

const within = (range: DateRange) => (t: { occurredOn: string }) => t.occurredOn >= range.first && t.occurredOn <= range.last;
const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);
const total = (rows: ReportTransaction[], kind: "expense" | "income") =>
  sum(rows.filter((t) => t.kind === kind).map((t) => t.amountGhsMinor));
// Share of a total to 1 decimal place (§7.1).
const share = (part: number, whole: number) => divideRounded(part * 1000, whole) / 10;
// The change from `before` to `now` in whole percent; null when before is 0.
const changePercent = (now: number, before: number) => (before === 0 ? null : divideRounded((now - before) * 100, before));

export function buildReport(input: ReportInput): Report {
  const { period, today, categories } = input;
  const asOf = period.last < today ? period.last : today;
  const rows = input.transactions.filter(within(period));
  const expenses = rows.filter((t) => t.kind === "expense");
  const spendingMinor = total(rows, "expense");
  const incomeMinor = total(rows, "income");
  const netMinor = incomeMinor - spendingMinor;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const spending = spendingByCategory(
    expenses.map((t) => ({ kind: t.kind, categoryId: t.categoryId, amountGhsMinor: t.amountGhsMinor })),
    categories,
  );

  // Categories with spending, biggest first; ties keep the user's category
  // order (the sort is stable).
  const inOrder = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const biggestFirst = (a: CategoryShare, b: CategoryShare) => b.spentMinor - a.spentMinor;
  const shares = (rows: CategoryRow[]): CategoryShare[] =>
    rows
      .map((c) => ({ categoryId: c.id, name: c.name, spentMinor: spending.get(c.id) ?? 0, sharePercent: 0 }))
      .filter((c) => c.spentMinor > 0)
      .map((c) => ({ ...c, sharePercent: share(c.spentMinor, spendingMinor) }))
      .sort(biggestFirst);
  const categoryLines: CategoryLine[] = shares(inOrder.filter((c) => c.kind === "expense" && c.parentId === null)).map(
    (top) => ({ ...top, children: shares(inOrder.filter((c) => c.parentId === top.categoryId)) }),
  );
  const most = categoryLines.length > 0 ? categoryLines[0].spentMinor : 0;
  const least = categoryLines.length > 0 ? categoryLines[categoryLines.length - 1].spentMinor : 0;

  const biggest = expenses.reduce<ReportTransaction | null>(
    (best, t) => (!best || t.amountGhsMinor > best.amountGhsMinor ? t : best),
    null,
  );

  const perDay = new Map<string, { spentMinor: number; count: number }>();
  for (const t of expenses) {
    const day = perDay.get(t.occurredOn) ?? { spentMinor: 0, count: 0 };
    perDay.set(t.occurredOn, { spentMinor: day.spentMinor + t.amountGhsMinor, count: day.count + 1 });
  }
  const busiest = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<[string, { spentMinor: number; count: number }] | null>(
      (best, day) => (!best || day[1].spentMinor > best[1].spentMinor ? day : best),
      null,
    );

  const isFee = (t: ReportTransaction) => {
    const category = byId.get(t.categoryId ?? "");
    const top = category?.parentId ? byId.get(category.parentId) : category;
    return top?.systemKey === "fees";
  };
  const fees = expenses.filter(isFee);

  const previous = previousPeriod(period);
  const previousRows = input.transactions.filter(within(previous));
  const previousSpending = total(previousRows, "expense");

  const windows = averageWindows(period);
  const average = averageOf(input, windows);

  const report: Report = {
    period,
    asOf,
    finished: today > period.last,
    totals: {
      spendingMinor,
      incomeMinor,
      netMinor,
      savedPercent: incomeMinor === 0 ? null : divideRounded(netMinor * 100, incomeMinor),
    },
    categories: categoryLines,
    mostSpentOn: categoryLines.filter((c) => c.spentMinor === most).map((c) => c.name),
    // "Least" needs something to compare with: at least two categories.
    leastSpentOn: categoryLines.length < 2 ? [] : categoryLines.filter((c) => c.spentMinor === least).map((c) => c.name),
    biggestExpense: biggest
      ? {
          id: biggest.id,
          occurredOn: biggest.occurredOn,
          amountGhsMinor: biggest.amountGhsMinor,
          categoryLabel: categoryPath(categories, biggest.categoryId ?? ""),
          note: biggest.note,
        }
      : null,
    busiestDay: busiest ? { date: busiest[0], ...busiest[1] } : null,
    fees: { count: fees.length, totalMinor: sum(fees.map((t) => t.amountGhsMinor)) },
    chartUnit: chartUnit(period),
    chart: chartBuckets(period).map((bucket) => {
      const inBucket = rows.filter(within(bucket));
      return { ...bucket, spendingMinor: total(inBucket, "expense"), incomeMinor: total(inBucket, "income") };
    }),
    previous: {
      period: previous,
      spendingMinor: previousSpending,
      incomeMinor: total(previousRows, "income"),
      spendingChangePercent: changePercent(spendingMinor, previousSpending),
    },
    average,
    budgets: budgetSection(input),
    goals: input.goals
      .filter((goal) => !goal.archived)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
      .map((goal) => goalLine(goal, asOf)),
    daysWithoutRecords: period.kind === "week" ? daysWithoutRecords(input, rows) : [],
    suggestions: [],
    categoryAverages:
      average?.status === "ok"
        ? categoryAverages(input, windows, spending)
        : [],
  };
  report.suggestions = allSuggestions(report).slice(0, T.MAX_SUGGESTIONS);
  return report;
}

// The average over the windows, or "not enough history" when the user's
// first transaction is after the first window starts.
function averageOf(input: ReportInput, windows: DateRange[]): Report["average"] {
  if (windows.length === 0) return null;
  if (input.historyStartsOn === null || input.historyStartsOn > windows[0].first) {
    return { status: "not_enough_history", periods: windows.length };
  }
  const rows = input.transactions.filter((t) => windows.some((w) => within(w)(t)));
  return {
    status: "ok",
    periods: windows.length,
    spendingMinor: divideRounded(total(rows, "expense"), windows.length),
    incomeMinor: divideRounded(total(rows, "income"), windows.length),
  };
}

// Every category (top-level and sub) with spending this period, and its
// average over the windows (S-3).
function categoryAverages(input: ReportInput, windows: DateRange[], spending: Map<string, number>) {
  const before = spendingByCategory(
    input.transactions
      .filter((t) => windows.some((w) => within(w)(t)))
      .map((t) => ({ kind: t.kind, categoryId: t.categoryId, amountGhsMinor: t.amountGhsMinor })),
    input.categories,
  );
  return input.categories
    .filter((c) => (spending.get(c.id) ?? 0) > 0)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      spentMinor: spending.get(c.id) ?? 0,
      averageMinor: divideRounded(before.get(c.id) ?? 0, windows.length),
    }));
}

// §7.3: the budget month's spending from its 1st to asOf.
function budgetSection(input: ReportInput): Report["budgets"] {
  const budget = budgetMonthFor(input.period, input.today);
  if (!budget) return null;
  const { month, asOf } = budget;
  const monthToDate = asOf ? input.transactions.filter(within({ first: `${month}-01`, last: asOf })) : [];
  const spending = spendingByCategory(
    monthToDate.map((t) => ({ kind: t.kind, categoryId: t.categoryId, amountGhsMinor: t.amountGhsMinor })),
    input.categories,
  );
  const dayOfMonth = asOf ? Number(asOf.slice(8, 10)) : 0;
  return { month, asOf, lines: budgetLines(input.categories, input.budgets, spending, month, dayOfMonth) };
}

function goalLine(goal: ReportGoal, asOf: string): GoalLine {
  const counted = goal.contributions.filter((c) => c.occurredOn <= asOf);
  const { savedMinor, percent } = goalProgress(
    counted.map((c) => c.amountMinor),
    goal.targetMinor,
  );
  const recentFrom = addDays(asOf, -7 * T.GOAL_RECENT_WEEKS + 1);
  const recent = sum(counted.filter((c) => c.occurredOn >= recentFrom).map((c) => c.amountMinor));
  const daysLeft = daysBetween(asOf, goal.targetDate);
  const reached = savedMinor >= goal.targetMinor;
  return {
    id: goal.id,
    name: goal.name,
    targetMinor: goal.targetMinor,
    targetDate: goal.targetDate,
    savedMinor,
    percent,
    neededPerWeekMinor:
      reached || daysLeft <= 0 ? null : divideRounded(goal.targetMinor - savedMinor, Math.ceil(daysLeft / 7)),
    recentWeeklyMinor: divideRounded(recent, T.GOAL_RECENT_WEEKS),
  };
}

// The days of the week, up to yesterday, with no transaction at all —
// counted only from the user's first transaction (S-8).
function daysWithoutRecords(input: ReportInput, rows: ReportTransaction[]): string[] {
  if (input.historyStartsOn === null) return [];
  const recorded = new Set(rows.map((t) => t.occurredOn));
  const days: string[] = [];
  for (let day = input.period.first; day <= input.period.last && day < input.today; day = addDays(day, 1)) {
    if (day >= input.historyStartsOn && !recorded.has(day)) days.push(day);
  }
  return days;
}

const NOUN = { week: "week", month: "month", custom: "period", year: "year" } as const;
const AVERAGE_NAME = { week: "4-week", month: "3-month" } as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ghs = (minor: number) => formatMoney(minor, "GHS");
// "Tue, Wed and Thu" (used for 3 or more items).
const listed = (items: string[]) => `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// Every suggestion that fires, in the priority order of §7.4. Each rule is
// a fact from the report plus one possible action, never a new number.
export function allSuggestions(report: Report): string[] {
  const out: string[] = [];
  const { period } = report;
  const averageName = period.kind === "week" || period.kind === "month" ? AVERAGE_NAME[period.kind] : null;

  // S-1, S-2: budgets.
  if (report.budgets) {
    const monthName = formatMonth(report.budgets.month).split(" ")[0];
    const { asOf } = report.budgets;
    // Days of the month after asOf.
    const left = asOf ? daysBetween(asOf, monthBounds(report.budgets.month).last) : 0;
    for (const line of report.budgets.lines) {
      if (line.status === "over") {
        out.push(`${line.label} is over budget by ${ghs(line.spentMinor - line.budgetMinor)} for ${monthName}.`);
      }
    }
    for (const line of report.budgets.lines) {
      if (
        asOf &&
        line.status !== "over" &&
        line.spentMinor * 100 >= line.budgetMinor * T.NEAR_BUDGET_PERCENT &&
        left >= T.NEAR_BUDGET_MIN_DAYS_LEFT
      ) {
        out.push(`${line.label} is at ${line.usedPercent}% of its ${monthName} budget with ${left} days left.`);
      }
    }
  }

  // S-3: spending jumps, the biggest first.
  if (averageName) {
    const jumps = report.categoryAverages.filter(
      (c) =>
        c.averageMinor > 0 &&
        c.spentMinor * 100 >= c.averageMinor * (100 + T.JUMP_PERCENT) &&
        c.spentMinor - c.averageMinor >= T.JUMP_MIN_MINOR,
    );
    jumps.sort((a, b) => b.spentMinor - b.averageMinor - (a.spentMinor - a.averageMinor));
    for (const c of jumps) {
      const above = divideRounded((c.spentMinor - c.averageMinor) * 100, c.averageMinor);
      out.push(`${c.name} was ${ghs(c.spentMinor)}, ${above}% above your ${averageName} average (${ghs(c.averageMinor)}).`);
    }
  }

  // S-4: fees, in a week.
  if (period.kind === "week" && (report.fees.totalMinor >= T.FEES_MIN_MINOR || report.fees.count >= T.FEES_MIN_COUNT)) {
    const items = report.fees.count === 1 ? "1 fee" : `${report.fees.count} fees`;
    out.push(`${items} cost ${ghs(report.fees.totalMinor)} this week. Fewer, larger transfers could save money.`);
  }

  // S-5: goals behind.
  for (const goal of report.goals) {
    if (goal.neededPerWeekMinor !== null && goal.neededPerWeekMinor > goal.recentWeeklyMinor) {
      out.push(
        `${goal.name} needs ${ghs(goal.neededPerWeekMinor)} a week to reach ${ghs(goal.targetMinor)} by ${formatRateDate(goal.targetDate)}.`,
      );
    }
  }

  // S-6: a good finished week or month.
  if (
    averageName &&
    report.finished &&
    report.average?.status === "ok" &&
    report.totals.spendingMinor > 0 &&
    report.totals.spendingMinor * 100 <= report.average.spendingMinor * T.GOOD_PERIOD_PERCENT
  ) {
    const less = divideRounded((report.average.spendingMinor - report.totals.spendingMinor) * 100, report.average.spendingMinor);
    out.push(`You spent ${less}% less than your ${averageName} average. Well done.`);
  }

  // S-7: saving opportunity.
  const saved = report.totals.savedPercent;
  const goal = report.goals.find((g) => g.neededPerWeekMinor !== null);
  if (saved !== null && saved >= T.SAVING_OPPORTUNITY_PERCENT && goal?.neededPerWeekMinor) {
    const kept = `You kept ${saved}% of this ${NOUN[period.kind]}'s income.`;
    out.push(
      period.kind === "week"
        ? `${kept} Moving ${ghs(goal.neededPerWeekMinor)} to ${goal.name} this week keeps it on track.`
        : `${kept} ${goal.name} needs ${ghs(goal.neededPerWeekMinor)} a week to stay on track.`,
    );
  }

  // S-8: missing days in a week.
  if (report.daysWithoutRecords.length >= T.MISSING_DAYS_MIN) {
    const names = report.daysWithoutRecords.map((day) => WEEKDAYS[weekday(day) - 1]);
    out.push(`Nothing was recorded on ${listed(names)}. Did you forget some spending?`);
  }
  return out;
}
