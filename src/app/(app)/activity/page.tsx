import { ArrowLeftRight, ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import { dayLabel, formatMonth, monthBounds, monthFromParam, shiftMonth, todayInAccra } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { groupByDay, involvesAccount, matchesSearch, totalsInGhs, type ActivityItem } from "@/lib/transactions";
import { cn } from "@/lib/utils";

import { getAccounts } from "../accounts/data";
import { getCategories } from "../categories/data";
import { AccountFilter } from "./account-filter";
import { getTransactionsBetween, toActivityItems } from "./data";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage(props: PageProps<"/activity">) {
  return (
    <>
      <PageHeader
        title="Activity"
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href="/add">
              <Plus aria-hidden="true" />
              Add
            </Link>
          </Button>
        }
      />
      {/* ?month, ?q and ?account come from the address (request data), so
          the list renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading activity…</p>}>
        <ActivityList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ActivityList({ searchParams }: { searchParams: PageProps<"/activity">["searchParams"] }) {
  const params = await searchParams;
  // Checks the session first: that makes this a per-request render, so
  // reading today's date below is allowed (Cache Components rule).
  await requireUser();
  const today = todayInAccra();
  const month = monthFromParam(params.month, today);
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const accountFilter = typeof params.account === "string" ? params.account : "";

  const { first, last } = monthBounds(month);
  const [rows, accounts, categories] = await Promise.all([
    getTransactionsBetween(first, last),
    getAccounts(),
    getCategories(),
  ]);
  const items = toActivityItems(rows, accounts, categories).filter(
    (item) => (!accountFilter || involvesAccount(item, accountFilter)) && matchesSearch(item, query),
  );
  const totals = totalsInGhs(items);
  const filtered = query !== "" || accountFilter !== "";

  // Links keep the search and filter when moving between months.
  const monthHref = (target: string) => {
    const next = new URLSearchParams({ month: target });
    if (query) next.set("q", query);
    if (accountFilter) next.set("account", accountFilter);
    return `/activity?${next}`;
  };

  return (
    <>
      <nav aria-label="Month" className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href={monthHref(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <h2 className="text-base font-bold">{formatMonth(month)}</h2>
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href={monthHref(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </nav>

      {/* A plain form: it works without JavaScript and puts the search in
          the address, so Back and refresh keep it. */}
      <form action="/activity" role="search" className="flex flex-col gap-2">
        <input type="hidden" name="month" value={month} />
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search notes, categories and accounts
          </label>
          <Input
            // A new box when the address changes, so it never shows old text.
            key={query}
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search"
            maxLength={100}
            className="h-11 flex-1 text-base"
          />
          <Button type="submit" variant="outline" className="h-11 w-11 shrink-0 px-0" aria-label="Search">
            <Search aria-hidden="true" />
          </Button>
        </div>
        <label htmlFor="account" className="sr-only">
          Account
        </label>
        <AccountFilter value={accountFilter}>
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </AccountFilter>
        {filtered ? (
          <Link href={`/activity?month=${month}`} className="self-start py-2 text-sm font-semibold text-primary">
            Clear search and filter
          </Link>
        ) : null}
      </form>

      <section aria-label="Totals" className="grid grid-cols-2 gap-2">
        <Total label="In" minor={totals.inMinor} />
        <Total label="Out" minor={totals.outMinor} />
      </section>

      {/* The whole month, without the search or filter: the same workbook
          as the month's report (D-20). A plain link, so the file downloads. */}
      <Button asChild variant="outline" className="h-11">
        <a href={`/api/export.xlsx?period=month&date=${month}-01`}>
          <FileSpreadsheet aria-hidden="true" />
          Download {formatMonth(month)} (Excel)
        </a>
      </Button>

      {items.length === 0 ? (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          {filtered ? "Nothing matches in this month." : "Nothing recorded in this month."}
        </p>
      ) : (
        groupByDay(items).map((day) => (
          <section key={day.date} className="flex flex-col gap-2" aria-label={dayLabel(day.date, today)}>
            <h3 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {dayLabel(day.date, today)}
            </h3>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {day.items.map((item) => (
                <li key={item.id}>
                  <ActivityRow item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function Total({ label, minor }: { label: string; minor: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border bg-card px-4 py-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{formatMoney(minor, "GHS")}</span>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  if (item.transfer) return <TransferRow item={item} transfer={item.transfer} />;
  const income = item.kind === "income";
  return (
    <Link
      href={`/activity/${item.id}`}
      className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words">{item.categoryLabel}</span>
        <span className="text-xs break-words text-muted-foreground">
          {item.note ? `${item.note} · ` : ""}
          {item.accountName}
        </span>
      </span>
      <span className={cn("shrink-0 font-bold tabular-nums", income && "text-primary")}>
        {/* Income adds money, an expense takes it away. */}
        <span className="sr-only">{income ? "Income" : "Expense"} </span>
        {income ? "+" : "−"}
        {formatMoney(item.amountMinor, item.currency)}
      </span>
    </Link>
  );
}

// A transfer is neither income nor spending (D-06), so it has no sign.
function TransferRow({ item, transfer }: { item: ActivityItem; transfer: NonNullable<ActivityItem["transfer"]> }) {
  const twoCurrencies = transfer.toCurrency !== item.currency;
  return (
    <Link
      href={`/activity/${item.id}`}
      className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
    >
      <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words">
          <span className="sr-only">Transfer: </span>
          {item.accountName} → {transfer.toAccountName}
        </span>
        {item.note ? <span className="text-xs break-words text-muted-foreground">{item.note}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end font-bold tabular-nums">
        {formatMoney(item.amountMinor, item.currency)}
        {twoCurrencies ? (
          <span className="text-xs font-semibold text-muted-foreground">
            → {formatMoney(transfer.receivedMinor, transfer.toCurrency)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
