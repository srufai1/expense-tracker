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
      <Day params={props.params} />
    </Suspense>
  );
}

async function Day({ params }: { params: PageProps<"/school/morning/[date]">["params"] }) {
  const { date } = await params;
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
          <MorningDayForm key={day?.noClass ? "was-no-class" : "class"} action={saveMorningDay} day={day?.noClass ? { ...start, noClass: false } : start} />
          <ViewDetails>
            Count only students who paid the full GHS 3.00 with + and −. Money from students who paid less goes in the
            box under each class. The school gets 0.50 for each full payer only.
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
