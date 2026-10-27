import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { Button } from "@/components/ui/button";
import type { AccountMovement } from "@/lib/account-history";
import { formatDate } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";

import { getAccount } from "../data";
import { getAccountHistory } from "../history-data";
import { MoneyText } from "../money-text";

export const metadata: Metadata = { title: "Account activity" };

export default function AccountPage(props: PageProps<"/accounts/[id]">) {
  return <Suspense fallback={<p>Loading account activity…</p>}><AccountActivity params={props.params} /></Suspense>;
}

async function AccountActivity({ params }: { params: PageProps<"/accounts/[id]">["params"] }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();
  const history = await getAccountHistory(account);
  const currency = account.currency;
  return <>
    <PageHeader title={account.name} backHref="/accounts" actions={<Button asChild variant="outline" className="h-11"><Link href={`/accounts/${account.id}/edit`}>Edit account</Link></Button>} />
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Total in this account</h2>
      <MoneyText minor={history.balanceMinor} currency={currency} className="text-3xl font-extrabold" />
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span>Holding for the school (included)</span><MoneyText minor={history.schoolHeldMinor} currency={currency} className="font-bold" /></div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><span>Your money after school funds</span><MoneyText minor={history.personalMinor} currency={currency} className="font-bold" /></div>
      <p className="text-sm text-muted-foreground">School money is part of the total, not extra money. Your money is the total minus what you hold for the school.</p>
      {history.balanceMinor !== account.balanceMinor ? <p role="alert">The loaded history and account total differ. Refresh this page; if they still differ, contact the app owner.</p> : null}
    </section>
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">How the balance is calculated</h2>
      <ViewDetails><p>Opening balance + money in − money out. Transfers affect both accounts; fees are separate expenses. A cash withdrawal from Bank or MoMo is a transfer to Cash, not new income.</p></ViewDetails>
      <div className="rounded-2xl border bg-card p-4"><p className="font-semibold">Opening balance · {formatDate(account.openingBalanceOn)}</p><MoneyText minor={account.openingBalanceMinor} currency={currency} /></div>
      <p className="text-sm text-muted-foreground">Newest day first. Each closing balance includes all recorded movements up to the end of that date.</p>
      {history.days.length === 0 ? <p>No movements since the opening date.</p> : history.days.map(day => <section key={day.date} className="overflow-hidden rounded-2xl border bg-card">
        <h3 className="px-4 pt-4 font-bold">{formatDate(day.date)}</h3>
        <MovementList entries={day.entries} currency={currency} />
        <p className="flex flex-wrap justify-between gap-2 border-t bg-muted/40 p-4 text-sm"><span>Balance after this day</span><MoneyText minor={day.balanceMinor} currency={currency} className="font-bold" /></p>
      </section>)}
      {history.beforeOpening.length > 0 ? <section className="rounded-2xl border bg-card p-4"><h3 className="font-semibold">Before the opening date — not added again</h3><p className="text-sm text-muted-foreground">These movements do not change the account balance. School funds still held are deducted from the total when showing your money.</p><MovementList entries={history.beforeOpening} currency={currency} /></section> : null}
    </section>
  </>;
}

function MovementList({ entries, currency }: { entries: AccountMovement[]; currency: Currency }) {
  return <ul className="divide-y">{entries.map(entry => <li key={entry.id}><Link href={entry.href} className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
    <span className="min-w-0 flex-1 basis-40 break-words text-sm">{entry.label}<span className="block text-xs text-muted-foreground">{formatDate(entry.date)}</span>{entry.school ? <span className="block text-xs text-muted-foreground">School funds · not personal income</span> : null}</span>
    <span className="font-semibold tabular-nums">{entry.amountMinor >= 0 ? "+" : "−"}{formatMoney(Math.abs(entry.amountMinor), currency)}</span>
  </Link></li>)}</ul>;
}
