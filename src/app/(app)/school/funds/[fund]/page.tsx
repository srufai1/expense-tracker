import { X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatDate } from "@/lib/dates";
import { FUNDS, type Fund } from "@/lib/school/fees";
import { cn } from "@/lib/utils";

import { ActionButton } from "../../action-button";
import { getFund } from "../../data";
import { FundSpendForm } from "../../forms";
import { deleteFundSpend, spendFromFund } from "../../morning-actions";
import { ghs, SectionTitle } from "../../ui";

export const metadata: Metadata = { title: "Savings fund" };

export default function FundPage(props: PageProps<"/school/funds/[fund]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <FundView params={props.params} />
    </Suspense>
  );
}

async function FundView({ params }: { params: PageProps<"/school/funds/[fund]">["params"] }) {
  const { fund: param } = await params;
  if (!(param in FUNDS)) notFound();
  const fund = param as Fund;
  const { balanceMinor, inMinor, outMinor, entries } = await getFund(fund);

  return (
    <>
      <PageHeader title={fund === "morning" ? "Savings fund" : "Teachers' book fund"} backHref="/school" />
      <section
        aria-label="Balance"
        className="flex flex-col gap-1 rounded-2xl bg-gradient-to-br from-[#B7791F] via-[#8A5300] to-[#5A3600] p-5 text-white shadow-sm"
      >
        <span className="text-sm font-semibold opacity-85">{FUNDS[fund]}</span>
        <span className="text-3xl font-extrabold tracking-tight tabular-nums">{ghs(balanceMinor)}</span>
        <span className="text-xs opacity-85">
          Saved {ghs(inMinor)} · Used {ghs(outMinor)}
        </span>
      </section>
      <ViewDetails>
        {fund === "morning"
          ? "Each settled week adds its savings here by itself. Use it for school events, e.g. sports or a science fair."
          : "Each past questions book given out adds the teachers' part here (GHS 10 when a book costs 45). It is kept apart from the Morning classes savings."}
      </ViewDetails>

      <h2 className="px-1 text-base font-bold">Use savings</h2>
      <FundSpendForm action={spendFromFund.bind(null, fund)} />

      {entries.length > 0 ? (
        <>
          <SectionTitle>History</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {entries.map((e) => (
              <li key={e.key} className="flex min-h-13 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold break-words">{e.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.detail} · {formatDate(e.date)}
                  </span>
                </span>
                <span className={cn("shrink-0 font-semibold tabular-nums", e.amountMinor < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                  {e.amountMinor < 0 ? "− " : "+ "}
                  {ghs(Math.abs(e.amountMinor))}
                </span>
                {e.spendId ? (
                  <ActionButton action={deleteFundSpend.bind(null, e.spendId)} size="icon" variant="ghost" label={`Remove ${e.label}`}>
                    <X aria-hidden="true" />
                  </ActionButton>
                ) : (
                  <span className="size-11 shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
