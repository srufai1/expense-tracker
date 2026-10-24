import Link from "next/link";

import type { BudgetLine } from "@/lib/budgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATUS_TEXT = { over: "Over", watch: "Watch", ok: "OK" } as const;
const STATUS_COLOR = {
  over: "bg-destructive",
  watch: "bg-amber-500",
  ok: "bg-primary",
} as const;

// A bar per budget: the fill is what was spent, the thin line is the pace
// (how far through the month we are, §7.3).
export function BudgetBar({ line }: { line: BudgetLine }) {
  const remaining = line.budgetMinor - line.spentMinor;
  return (
    <Link
      href={`/budgets/${line.categoryId}`}
      className={cn(
        "flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none",
        line.depth === 1 && "pl-8",
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn("min-w-0 break-words", line.depth === 0 ? "font-bold" : "text-sm font-semibold")}>
          {line.label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
            line.status === "over" && "bg-destructive/10 text-destructive",
            line.status === "watch" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
            line.status === "ok" && "bg-primary/10 text-primary",
          )}
        >
          {STATUS_TEXT[line.status]}
        </span>
      </span>
      <span
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${line.usedPercent}% used, ${line.pacePercent}% of the month gone`}
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_COLOR[line.status])}
          style={{ width: `${Math.min(100, line.usedPercent)}%` }}
        />
        <span className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${line.pacePercent}%` }} />
      </span>
      <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>
          {formatMoney(line.spentMinor, "GHS")} of {formatMoney(line.budgetMinor, "GHS")}
        </span>
        <span className={cn(remaining < 0 && "font-semibold text-destructive")}>
          {remaining < 0 ? `${formatMoney(-remaining, "GHS")} over` : `${formatMoney(remaining, "GHS")} left`}
        </span>
      </span>
    </Link>
  );
}
