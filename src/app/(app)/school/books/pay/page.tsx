import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatMoney } from "@/lib/money";

import { recordBookPayment } from "../../book-actions";
import { getStudents, getSubjects } from "../../data";
import { PaymentForm } from "../../forms";

export const metadata: Metadata = { title: "Book payment" };

export default function BookPaymentPage(props: PageProps<"/school/books/pay">) {
  return (
    <>
      <PageHeader title="Book payment" backHref="/school/books" />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Pay searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Pay({ searchParams }: { searchParams: PageProps<"/school/books/pay">["searchParams"] }) {
  const { student } = await searchParams;
  const [students, subjects] = await Promise.all([getStudents(), getSubjects()]);
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
      ) : null}
      <PaymentForm
        action={recordBookPayment}
        allowZero
        defaultStudent={typeof student === "string" ? student : ""}
        students={students.map((s) => ({ id: s.id, label: `${s.name}${s.className ? ` (${s.className})` : ""}` }))}
        subjects={active.map((s) => ({ id: s.id, label: `${s.name} · ${formatMoney(s.priceMinor, "GHS")}` }))}
      />
      <ViewDetails>
        Choose the books the student wants and enter what they paid. A part payment is an advance; the balance shows on
        their page. A book they already have on order is not added twice.
      </ViewDetails>
    </>
  );
}
