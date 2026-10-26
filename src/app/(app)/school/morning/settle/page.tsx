import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDate, todayInAccra } from "@/lib/dates";
import { schoolWeekDays, weekFromParam } from "@/lib/school/week";

import { getMorningWeek, getSharers } from "../../data";
import { SettleForm } from "../../forms";
import { settleMorningWeek } from "../../morning-actions";

export const metadata: Metadata = { title: "Settle the week" };

export default function SettlePage(props: PageProps<"/school/morning/settle">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <Settle searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Settle({ searchParams }: { searchParams: PageProps<"/school/morning/settle">["searchParams"] }) {
  const { week: param } = await searchParams;
  // The session first: it marks the page as per-request before the clock is read.
  await requireUser();
  const today = todayInAccra();
  const monday = weekFromParam(param, today);
  const dates = schoolWeekDays(monday);
  const [{ days, week }, sharers] = await Promise.all([getMorningWeek(monday, dates[4]), getSharers()]);
  if (week) redirect(`/school/morning?week=${monday}`);
  const active = sharers.filter((s) => !s.archived);
  // Usually settled on Friday; never a day that has not come yet.
  const settledOn = today < dates[4] ? today : dates[4];

  return (
    <>
      <PageHeader title="Settle the week" backHref={`/school/morning?week=${monday}`} />
      <p className="px-1 font-semibold">Week of {formatDate(monday)}</p>
      {active.length === 0 ? (
        <Button asChild className="h-11">
          <Link href="/school/morning/sharers">Add the people who share first</Link>
        </Button>
      ) : (
        <SettleForm
          action={settleMorningWeek.bind(null, monday)}
          days={days}
          sharers={active.map((s) => ({ id: s.id, name: s.name }))}
          settledOn={settledOn < monday ? monday : settledOn}
        />
      )}
    </>
  );
}
