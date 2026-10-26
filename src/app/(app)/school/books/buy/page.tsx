import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatDate } from "@/lib/dates";

import { ActionButton } from "../../action-button";
import { deletePurchase, recordPurchase } from "../../book-actions";
import { getPurchases, getSubjects } from "../../data";
import { PurchaseForm } from "../../forms";
import { ghs, SectionTitle } from "../../ui";

export const metadata: Metadata = { title: "Books bought" };

export default function BooksBoughtPage() {
  return (
    <>
      <PageHeader title="Books bought" backHref="/school/books" />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Bought />
      </Suspense>
    </>
  );
}

async function Bought() {
  const [subjects, purchases] = await Promise.all([getSubjects(), getPurchases()]);
  const active = subjects.filter((s) => !s.archived);
  return (
    <>
      {active.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm">
          Add the subjects first.{" "}
          <Link href="/school/books/subjects" className="font-semibold underline">
            Subjects and prices
          </Link>
        </p>
      ) : (
        <PurchaseForm action={recordPurchase} subjects={active.map((s) => ({ id: s.id, name: s.name }))} />
      )}
      <ViewDetails>
        The money comes from the book money you hold. Books are given out in the order you bought them, so each copy
        counts at what it really cost.
      </ViewDetails>
      {purchases.length > 0 ? (
        <>
          <SectionTitle>History</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold break-words">
                    {p.quantity} × {p.subject}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(p.boughtOn)}</span>
                </span>
                <span className="font-semibold tabular-nums">{ghs(p.amountMinor)}</span>
                <ActionButton
                  action={deletePurchase.bind(null, p.id)}
                  size="icon"
                  variant="ghost"
                  label={`Remove ${p.quantity} ${p.subject}`}
                  confirm={{ title: "Remove this purchase?", description: "Only possible while none of these books were given out.", yes: "Remove" }}
                >
                  <X aria-hidden="true" />
                </ActionButton>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
