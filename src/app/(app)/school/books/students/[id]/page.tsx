import { Undo2, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { formatDate } from "@/lib/dates";
import { givableBooks } from "@/lib/school/books";
import { payStatus } from "@/lib/school/fees";

import { ActionButton } from "../../../action-button";
import { deleteBookPayment, giveOutBooks, removeBookOrder, undoGiveOut } from "../../../book-actions";
import { getBookStudent, getLastGivenSeq, getSubjects } from "../../../data";
import { GiveOutForm } from "../../../forms";
import { ghs, MoneyRow, Panel, SectionTitle, StatusPill } from "../../../ui";

export const metadata: Metadata = { title: "Student's books" };

export default function BookStudentPage(props: PageProps<"/school/books/students/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <BookStudent params={props.params} />
    </Suspense>
  );
}

async function BookStudent({ params }: { params: PageProps<"/school/books/students/[id]">["params"] }) {
  const { id } = await params;
  const [data, subjects, lastGiven] = await Promise.all([getBookStudent(id), getSubjects(), getLastGivenSeq()]);
  if (!data) notFound();
  const { student, orders, payments } = data;
  const payableMinor = orders.reduce((t, o) => t + o.priceMinor, 0);
  const paidMinor = payments.reduce((t, p) => t + p.amountMinor, 0);
  const givenMinor = orders.filter((o) => o.givenOn).reduce((t, o) => t + o.priceMinor, 0);
  const status = payStatus(payableMinor, paidMinor);
  const stock = new Map(subjects.map((s) => [s.id, s.bought - s.given]));

  // Paid money not yet used by given books decides what can go out now.
  const waiting = orders.filter((o) => !o.givenOn);
  const givable = givableBooks(waiting, { stock, paidMinor, givenMinor });
  const notGiven = waiting.map((o) => {
    const state = givable.get(o.id) ?? "none left";
    return { id: o.id, label: `${o.subject} · ${ghs(o.priceMinor)}`, disabled: state === "ok" ? null : state };
  });

  return (
    <>
      <PageHeader title={student.name} backHref="/school/books" />
      <Panel label="Payment">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {student.className || "Past questions"} · {orders.length} book{orders.length === 1 ? "" : "s"}
          </span>
          <StatusPill status={status} />
        </div>
        <MoneyRow label="Books ordered" minor={payableMinor} />
        <MoneyRow label="Paid (advance)" minor={paidMinor} />
        {status.kind === "part" || status.kind === "unpaid" ? <MoneyRow label="Balance to pay" minor={status.balanceMinor} strong /> : null}
      </Panel>
      <Button asChild variant="outline" className="h-11">
        <Link href={`/school/books/pay?student=${student.id}`}>+ Payment or more books</Link>
      </Button>

      {notGiven.length > 0 ? (
        <>
          <h2 className="px-1 pt-2 text-base font-bold">Give out</h2>
          {notGiven.some((b) => !b.disabled) ? (
            <GiveOutForm action={giveOutBooks.bind(null, student.id)} books={notGiven} />
          ) : (
            <ul className="flex flex-col gap-1 rounded-2xl border bg-card p-4 text-sm">
              {notGiven.map((b) => (
                <li key={b.id}>
                  {b.label}: <span className="text-muted-foreground">{b.disabled}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <SectionTitle>Books</SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
        {orders.map((o) => (
          <li key={o.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold break-words">{o.subject}</span>
              <span className="text-xs text-muted-foreground">{o.givenOn ? `Given ${formatDate(o.givenOn)}` : "Not given yet"}</span>
              {o.split ? (
                <ViewDetails className="mt-1">
                  Cost {ghs(o.split.costMinor)} · transport {ghs(o.split.transportMinor)} · teachers {ghs(o.split.teachersMinor)} · mine{" "}
                  {ghs(o.split.mineMinor)}
                </ViewDetails>
              ) : null}
            </span>
            <span className="font-semibold tabular-nums">{ghs(o.priceMinor)}</span>
            {o.givenOn ? (
              o.givenSeq === lastGiven.get(o.subjectId) ? (
                <ActionButton
                  action={undoGiveOut.bind(null, o.id)}
                  size="icon"
                  variant="ghost"
                  label={`Undo giving out ${o.subject}`}
                  confirm={{ title: "Undo giving out this book?", description: "The book goes back into stock and its split is removed.", yes: "Undo" }}
                >
                  <Undo2 aria-hidden="true" />
                </ActionButton>
              ) : (
                <span className="size-11 shrink-0" aria-hidden="true" />
              )
            ) : (
              <ActionButton
                action={removeBookOrder.bind(null, o.id)}
                size="icon"
                variant="ghost"
                label={`Remove ${o.subject}`}
                confirm={{ title: `Remove ${o.subject}?`, description: "The student no longer wants this book.", yes: "Remove" }}
              >
                <X aria-hidden="true" />
              </ActionButton>
            )}
          </li>
        ))}
      </ul>

      {payments.length > 0 ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{formatDate(p.paidOn)}</span>
                  {p.note ? <span className="text-xs break-words text-muted-foreground">{p.note}</span> : null}
                </span>
                <span className="font-semibold tabular-nums">{ghs(p.amountMinor)}</span>
                <ActionButton
                  action={deleteBookPayment.bind(null, p.id)}
                  size="icon"
                  variant="ghost"
                  label={`Remove ${ghs(p.amountMinor)} on ${formatDate(p.paidOn)}`}
                  confirm={{ title: "Remove this payment?", description: "Use this for a payment entered by mistake.", yes: "Remove" }}
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
