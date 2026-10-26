import { Undo2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatDate } from "@/lib/dates";
import { RECIPIENTS } from "@/lib/school/fees";

import { ActionButton } from "../../../action-button";
import { getFee, getHeld } from "../../../data";
import { handOver, undoHandover } from "../../../fee-actions";
import { HandoverForm } from "../../../forms";
import { ghs, SectionTitle } from "../../../ui";

export const metadata: Metadata = { title: "Hand over" };

export default function HandOverPage(props: PageProps<"/school/fees/[id]/hand-over">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <HandOver params={props.params} />
    </Suspense>
  );
}

async function HandOver({ params }: { params: PageProps<"/school/fees/[id]/hand-over">["params"] }) {
  const { id } = await params;
  const [fee, held] = await Promise.all([getFee(id), getHeld()]);
  if (!fee) notFound();
  const holding = held.byFee.get(fee.id) ?? 0;
  return (
    <>
      <PageHeader title="Hand over" backHref={`/school/fees/${fee.id}`} />
      <p className="px-1 text-sm">
        <span className="font-semibold">{fee.name}</span> · holding {ghs(holding)}
      </p>
      {holding > 0 ? (
        <HandoverForm action={handOver.bind(null, fee.id)} holdingMinor={holding} />
      ) : (
        <p className="rounded-2xl border bg-card p-4 text-sm">Nothing to hand over: you are holding nothing for this fee.</p>
      )}
      {fee.handovers.length > 0 ? (
        <>
          <SectionTitle>Handed over</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {fee.handovers.map((h) => (
              <li key={h.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{RECIPIENTS[h.toWhom]}</span>
                  <span className="text-xs break-words text-muted-foreground">
                    {formatDate(h.handedOn)}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{ghs(h.amountMinor)}</span>
                <ActionButton
                  action={undoHandover.bind(null, h.id)}
                  size="icon"
                  variant="ghost"
                  label={`Undo ${ghs(h.amountMinor)} to ${RECIPIENTS[h.toWhom]}`}
                  confirm={{ title: "Undo this hand-over?", description: "The money counts as held again.", yes: "Undo" }}
                >
                  <Undo2 aria-hidden="true" />
                </ActionButton>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
