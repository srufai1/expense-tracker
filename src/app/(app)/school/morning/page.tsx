import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { requireUser } from "@/lib/auth";
import { formatDate, shortDayMonth, todayInAccra } from "@/lib/dates";
import { NO_CLASS_REASONS } from "@/lib/school/fees";
import { dayTotals } from "@/lib/school/morning";
import { schoolWeekDays, shiftWeek, weekFromParam } from "@/lib/school/week";
import { cn } from "@/lib/utils";

import { ActionButton } from "../action-button";
import { getMorningWeek, getSchoolSettings } from "../data";
import { setSharePaid, unsettleMorningWeek } from "../morning-actions";
import { ghs, MoneyRow, Panel, Pill } from "../ui";

export const metadata: Metadata = { title: "Morning classes" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function MorningPage(props: PageProps<"/school/morning">) {
  return (
    <>
      <PageHeader
        title="Morning classes"
        backHref="/school"
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href="/school/morning/sharers">
              <Users aria-hidden="true" /> Sharers
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Week searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Week({ searchParams }: { searchParams: PageProps<"/school/morning">["searchParams"] }) {
  const { week: param } = await searchParams;
  // The session first: it marks the page as per-request before the clock is read.
  await requireUser();
  const today = todayInAccra();
  const monday = weekFromParam(param, today);
  const dates = schoolWeekDays(monday);
  const [settings, { days, week }] = await Promise.all([getSchoolSettings(), getMorningWeek(monday, dates[4])]);
  if (!settings) {
    return (
      <Button asChild className="h-11">
        <Link href="/school">Set up School money first</Link>
      </Button>
    );
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  const collected = days.reduce((total, day) => total + dayTotals(day).collectedMinor, 0);
  const classDays = days.filter((day) => !day.noClass).length;

  return (
    <>
      <nav aria-label="Week" className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href={`/school/morning?week=${shiftWeek(monday, -1)}`} aria-label="Week before">
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <span className="font-bold">Week of {formatDate(monday)}</span>
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href={`/school/morning?week=${shiftWeek(monday, 1)}`} aria-label="Week after">
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </nav>

      <Panel label="Days">
        <div className="grid grid-cols-5 gap-1.5">
          {dates.map((date, i) => {
            const day = byDate.get(date);
            const totals = day ? dayTotals(day) : null;
            const content = (
              <>
                <span className="text-xs">{WEEKDAYS[i]}</span>
                <span className="text-base font-bold tabular-nums">
                  {day?.noClass ? "—" : totals ? Math.round(totals.collectedMinor / 100) : "+"}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {day?.noClass ? NO_CLASS_REASONS[day.reason ?? "other"] : totals ? `${totals.fullPayers} full` : shortDayMonth(date)}
                </span>
              </>
            );
            const style = cn(
              "flex min-h-16 flex-col items-center justify-center rounded-xl px-1 py-2 text-center",
              day?.noClass ? "bg-muted text-muted-foreground" : day ? "bg-muted/60" : "border border-dashed",
              date === today && "ring-2 ring-primary",
            );
            return week ? (
              <div key={date} className={style}>
                {content}
              </div>
            ) : (
              <Link key={date} href={`/school/morning/${date}`} className={style} aria-label={`${WEEKDAYS[i]} ${shortDayMonth(date)}`}>
                {content}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm text-muted-foreground">
            Collected · {classDays} class day{classDays === 1 ? "" : "s"}
          </span>
          <span className="text-xl font-extrabold whitespace-nowrap tabular-nums">{ghs(collected)}</span>
        </div>
      </Panel>

      {week ? (
        <Settled week={week} />
      ) : classDays > 0 ? (
        <Button asChild size="lg" className="h-12 text-base">
          <Link href={`/school/morning/settle?week=${monday}`}>Settle this week…</Link>
        </Button>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">Tap a day to record what was collected.</p>
      )}
    </>
  );
}

function Settled({ week }: { week: NonNullable<Awaited<ReturnType<typeof getMorningWeek>>["week"]> }) {
  return (
    <>
      <Panel label="Settled">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Settled</h2>
          <Pill tone="ok">{formatDate(week.settledOn)}</Pill>
        </div>
        <MoneyRow label="School" minor={week.schoolMinor} />
        <MoneyRow label="Savings" minor={week.savingsMinor} />
        <MoneyRow label="Markers" minor={week.markersMinor} />
        <MoneyRow label="Assistant headmistress" minor={week.assistantMinor} />
        <MoneyRow label={`Each of ${week.shares.length}`} minor={week.eachMinor} strong />
        <ViewDetails>
          Check: {ghs(week.schoolMinor)} + {ghs(week.savingsMinor)} + {ghs(week.markersMinor)} + {ghs(week.assistantMinor)} +{" "}
          {week.shares.length} × {ghs(week.eachMinor)} = {ghs(week.collectedMinor)}.{" "}
          {week.leftoverMinor > 0 ? `${ghs(week.leftoverMinor)} left over from the share went to savings.` : ""}
        </ViewDetails>
      </Panel>

      <Panel label="Shares">
        <h2 className="font-bold">Teachers</h2>
        <ul className="flex flex-col divide-y">
          {week.shares.map((share) => (
            <li key={share.id} className="flex min-h-12 items-center justify-between gap-2 py-1">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold break-words">{share.name}</span>
                <span className="text-xs text-muted-foreground">
                  {share.isMe ? "Added to your income" : share.paidOn ? `Paid ${formatDate(share.paidOn)}` : "Not paid yet"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-bold tabular-nums">{ghs(share.amountMinor)}</span>
                {share.isMe ? null : (
                  <ActionButton action={setSharePaid.bind(null, share.id, !share.paidOn)} variant={share.paidOn ? "outline" : "default"}>
                    {share.paidOn ? "Undo" : "Paid"}
                  </ActionButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <ActionButton
        action={unsettleMorningWeek.bind(null, week.id)}
        confirm={{
          title: "Undo this settlement?",
          description: "The week's days can be changed again, and your share is removed from your income. Spending from the savings fund must stay covered.",
          yes: "Undo settlement",
        }}
      >
        Undo settlement
      </ActionButton>
    </>
  );
}
