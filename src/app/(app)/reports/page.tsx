import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";
import { parseReportParams, periodHref, periodQuery, periodTitle, shiftPeriod } from "@/lib/reports/params";
import { periodFor, PERIOD_KINDS, type PeriodKind } from "@/lib/reports/periods";
import { cn } from "@/lib/utils";

import { CustomRangeForm } from "./custom-range-form";
import { getReport } from "./data";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader title="Reports" />
      {/* Reads the address, the session and today's date, so it renders per
          request inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the report…</p>}>
        <Report searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const TAB_LABEL: Record<PeriodKind, string> = { week: "Week", month: "Month", custom: "Custom", year: "Year" };

async function Report({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  await requireUser();
  const today = todayInAccra();
  const { period, error } = parseReportParams(await searchParams, today);
  const report = await getReport(period, today);
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <>
      <PeriodTabs current={period.kind} today={today} />
      {period.kind === "custom" ? (
        // The key resets the form when the address changes.
        <CustomRangeForm key={`${period.first}-${period.last}-${error}`} from={period.first} to={period.last} serverError={error} />
      ) : null}
      <nav className="flex items-center justify-between gap-2" aria-label="Report period">
        <Link
          href={periodHref(previous)}
          aria-label={`Previous: ${periodTitle(previous)}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h2 className="min-w-0 text-center text-lg font-bold break-words">{periodTitle(period)}</h2>
        {next.first <= today ? (
          <Link
            href={periodHref(next)}
            aria-label={`Next: ${periodTitle(next)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          // Nothing to show after today.
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
      </nav>
      {/* Plain links: the files download instead of opening a page (D-20). */}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-11">
          <a href={`/api/report.pdf?${periodQuery(period)}`}>
            <FileText aria-hidden="true" />
            Download PDF
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <a href={`/api/export.xlsx?${periodQuery(period)}`}>
            <FileSpreadsheet aria-hidden="true" />
            Excel
          </a>
        </Button>
      </div>
      <ReportView report={report} today={today} />
    </>
  );
}

// Week / Month / Custom / Year: each opens the period that contains today.
function PeriodTabs({ current, today }: { current: PeriodKind; today: string }) {
  const href = (kind: PeriodKind) =>
    kind === "custom" ? "/reports?period=custom" : periodHref(periodFor(kind, today));
  return (
    <nav aria-label="Report type" className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
      {PERIOD_KINDS.map((kind) => (
        <Link
          key={kind}
          href={href(kind)}
          aria-current={kind === current ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center justify-center rounded-lg text-sm font-bold text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            kind === current && "bg-card text-foreground shadow-sm",
          )}
        >
          {TAB_LABEL[kind]}
        </Link>
      ))}
    </nav>
  );
}
