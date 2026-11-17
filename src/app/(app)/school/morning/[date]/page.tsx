import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { requireUser } from "@/lib/auth";
import { dayLabel, isIsoDate, todayInAccra } from "@/lib/dates";
import { MORNING_FEE_MINOR, MORNING_SCHOOL_MINOR, type MorningDay } from "@/lib/school/morning";
import { isWeekday, mondayOf } from "@/lib/school/week";

import { ActionButton } from "../../action-button";
import { getMorningDay, isWeekSettled } from "../../data";
import { MorningDayForm, NoClassForm } from "../../forms";
import { clearMorningDay, markNoClass, saveMorningDay } from "../../morning-actions";

export const metadata: Metadata = { title: "Morning classes" };

export default function MorningDayPage(props: PageProps<"/school/morning/[date]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <Day params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

type Props = PageProps<"/school/morning/[date]">;
async function Day({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ date }, { saved }] = await Promise.all([params, searchParams]);
  if (!isIsoDate(date) || !isWeekday(date)) notFound();
  // The session first: it marks the page as per-request before the clock is read.
  await requireUser();
  const today = todayInAccra();
  const back = `/school/morning?week=${mondayOf(date)}`;
  const [day, settled] = await Promise.all([getMorningDay(date), isWeekSettled(mondayOf(date))]);

  const title = dayLabel(date, today);
  if (settled) {
    return (
      <>
        <PageHeader title={title} backHref={back} />
        <p className="rounded-2xl border bg-card p-4 text-sm">This week is settled. Undo the settlement to change its days.</p>
        <Button asChild variant="outline" className="h-11">
          <Link href={back}>Back to the week</Link>
        </Button>
      </>
    );
  }

  const start: MorningDay = day ?? {
    date,
    noClass: false,
    full: [0, 0, 0],
    lessMinor: [0, 0, 0],
    feeMinor: MORNING_FEE_MINOR,
    schoolMinor: MORNING_SCHOOL_MINOR,
  };

  return (
    <>
      <PageHeader title={title} backHref={back} />
      {date <= today ? (
        <>
          {saved === "1" ? <p role="status" className="text-sm font-semibold text-primary">Collections saved.</p> : null}
          <MorningDayForm key={`${date}:${day?.updatedAt ?? "new"}`} action={saveMorningDay.bind(null, day?.updatedAt ?? null)} day={day?.noClass ? { ...start, noClass: false } : start} />
          <ViewDetails>
            Enter each class’s total for the day. Every full GHS 3.00 counts as one payment for sharing.
            Any remainder stays in the collection total.
          </ViewDetails>
        </>
      ) : null}

      <h2 className="px-1 pt-2 text-base font-bold">No class on this day?</h2>
      <NoClassForm action={markNoClass} date={date} reason={day?.noClass ? day.reason : null} note={day?.note} />

      {day ? (
        <ActionButton
          action={clearMorningDay.bind(null, date)}
          variant="ghost"
          confirm={{ title: "Clear this day?", description: "What you recorded for this day is removed.", yes: "Clear day" }}
        >
          Clear this day
        </ActionButton>
      ) : null}
    </>
  );
}
