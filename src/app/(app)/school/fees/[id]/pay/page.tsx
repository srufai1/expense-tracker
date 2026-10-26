import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { payStatus } from "@/lib/school/fees";

import { getFee } from "../../../data";
import { recordFeePayment } from "../../../fee-actions";
import { PaymentForm } from "../../../forms";
import { ghs, statusDetail } from "../../../ui";

export const metadata: Metadata = { title: "Payment" };

export default function FeePaymentPage(props: PageProps<"/school/fees/[id]/pay">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <Pay params={props.params} />
    </Suspense>
  );
}

async function Pay({ params }: { params: PageProps<"/school/fees/[id]/pay">["params"] }) {
  const { id } = await params;
  const fee = await getFee(id);
  if (!fee) notFound();
  return (
    <>
      <PageHeader title="Payment" backHref={`/school/fees/${fee.id}`} />
      <p className="px-1 font-semibold">{fee.name}</p>
      <PaymentForm
        action={recordFeePayment.bind(null, fee.id)}
        students={fee.students.map((s) => ({
          id: s.studentId,
          label: `${s.name}${s.className ? ` (${s.className})` : ""} — ${statusDetail(payStatus(s.payableMinor, s.paidMinor), s.paidMinor)}`,
        }))}
      />
      <ViewDetails>
        A new student is added to this fee at {ghs(fee.amountMinor)}. The payment is compared with what they should pay:
        less is an advance with a balance to pay.
      </ViewDetails>
    </>
  );
}
