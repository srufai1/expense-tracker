import { BookOpen, Plus, Sun } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { todayInAccra } from "@/lib/dates";
import { mondayOf, schoolWeekDays } from "@/lib/school/week";
import { dayTotals } from "@/lib/school/morning";

import { getFees, getFundBalances, getGhsAccounts, getHeld, getMorningWeek, getSchoolSettings, getUnpaidShares } from "./data";
import { SetupForm } from "./forms";
import { setUpSchoolMoney } from "./morning-actions";
import { ghs, LinkRow, Pill, SectionTitle } from "./ui";

export const metadata: Metadata = { title: "School money" };

export default function SchoolPage() {
  return (
    <>
      <PageHeader title="School money" />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <School />
      </Suspense>
    </>
  );
}

async function School() {
  // Reads the session first (requireUser), then the clock.
  const settings = await getSchoolSettings();
  if (!settings) return <SetUp />;

  const today = todayInAccra();
  const monday = mondayOf(today);
  const [held, funds, fees, week, unpaid] = await Promise.all([
    getHeld(),
    getFundBalances(),
    getFees(),
    getMorningWeek(monday, schoolWeekDays(monday)[4]),
    getUnpaidShares(),
  ]);
  const thisWeekMinor = week.week ? 0 : week.days.reduce((total, day) => total + dayTotals(day).collectedMinor, 0);
  const activeFees = fees.filter((fee) => !fee.archived);

  return (
    <>
      <section
        aria-label="Holding for the school"
        className="flex flex-col gap-1 rounded-2xl bg-gradient-to-br from-[#2F5D8A] via-[#1D3F63] to-[#0F2742] p-5 text-white shadow-sm"
      >
        <span className="text-sm font-semibold opacity-85">Holding for the school</span>
        <span className="text-3xl font-extrabold tracking-tight tabular-nums">{ghs(held.totalMinor)}</span>
        <span className="text-xs opacity-85">In {settings.accountName} · not your money</span>
      </section>
      <ViewDetails>
        School money is counted in {settings.accountName}&apos;s balance, but never as your income or spending. Only
        your own share becomes income (category: School money).{" "}
        <Link href="/school/setup" className="font-semibold underline">
          Change the account
        </Link>
      </ViewDetails>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <LinkRow
          href="/school/morning"
          title={
            <span className="flex items-center gap-2">
              <Sun className="size-4 text-amber-500" aria-hidden="true" /> Morning classes
            </span>
          }
          detail={week.week ? "This week is settled" : `This week so far`}
          right={
            <>
              <span className="font-bold tabular-nums">{ghs(thisWeekMinor)}</span>
              {unpaid.count > 0 ? <Pill tone="warn">{unpaid.count} to pay</Pill> : null}
            </>
          }
        />
        <div className="border-t">
          <LinkRow href="/school/funds/morning" title="Savings fund" detail="Morning classes savings" right={<span className="font-bold tabular-nums">{ghs(funds.morning)}</span>} />
        </div>
      </div>

      <SectionTitle>Fees to hand over</SectionTitle>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {activeFees.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No fees yet. Add one for entrance exams, mocks or anything else you collect.</p>
        ) : (
          activeFees.map((fee, i) => {
            const holding = held.byFee.get(fee.id) ?? 0;
            return (
              <div key={fee.id} className={i > 0 ? "border-t" : undefined}>
                <LinkRow
                  href={`/school/fees/${fee.id}`}
                  title={fee.name}
                  detail={`${ghs(fee.amountMinor)} each`}
                  right={
                    <>
                      <span className="font-bold tabular-nums">{ghs(holding)}</span>
                      {holding === 0 ? <Pill tone="ok">all handed over</Pill> : <Pill tone="plain">holding</Pill>}
                    </>
                  }
                />
              </div>
            );
          })
        )}
      </div>
      <Button asChild variant="outline" className="h-11">
        <Link href="/school/fees/new">
          <Plus aria-hidden="true" /> New fee
        </Link>
      </Button>

      <SectionTitle>Books</SectionTitle>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <LinkRow
          href="/school/books"
          title={
            <span className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" aria-hidden="true" /> Past questions books
            </span>
          }
          detail="Payments, books bought, giving out"
          right={<span className="font-bold tabular-nums">{ghs(held.booksMinor + held.fundBooksMinor - funds.books)}</span>}
        />
        <div className="border-t">
          <LinkRow
            href="/school/funds/books"
            title="Teachers' book fund"
            detail="From books given out"
            right={<span className="font-bold tabular-nums">{ghs(funds.books)}</span>}
          />
        </div>
      </div>
      {fees.some((fee) => fee.archived) ? (
        <ViewDetails label="Archived fees">
          <ul className="flex flex-col gap-1">
            {fees
              .filter((fee) => fee.archived)
              .map((fee) => (
                <li key={fee.id}>
                  <Link href={`/school/fees/${fee.id}`} className="underline">
                    {fee.name}
                  </Link>
                </li>
              ))}
          </ul>
        </ViewDetails>
      ) : null}
    </>
  );
}

async function SetUp() {
  const accounts = await getGhsAccounts();
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <h2 className="text-lg font-bold">Set up School money</h2>
      <p className="text-sm text-muted-foreground">Choose where you keep the money you collect for the school.</p>
      {accounts.length === 0 ? (
        <Button asChild className="h-11">
          <Link href="/accounts/new">Add a GHS account first</Link>
        </Button>
      ) : (
        <SetupForm action={setUpSchoolMoney} accounts={accounts} />
      )}
      <ViewDetails>
        The money stays in that account&apos;s balance but is not counted as your income. Your own share is added as
        income in a new &quot;School money&quot; category.
      </ViewDetails>
    </section>
  );
}
