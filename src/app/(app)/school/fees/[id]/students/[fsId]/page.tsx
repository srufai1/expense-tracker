import { X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatDate } from "@/lib/dates";
import { formatAmountForInput } from "@/lib/money";
import { payStatus } from "@/lib/school/fees";

import { ActionButton } from "../../../../action-button";
import { getFee } from "../../../../data";
import { deleteFeePayment, removeFeeStudent, setPayable } from "../../../../fee-actions";
import { PayableForm } from "../../../../forms";
import { ghs, MoneyRow, Panel, SectionTitle, StatusPill } from "../../../../ui";

export const metadata: Metadata = { title: "Student" };

export default function FeeStudentPage(props: PageProps<"/school/fees/[id]/students/[fsId]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <FeeStudent params={props.params} />
    </Suspense>
  );
}

async function FeeStudent({ params }: { params: PageProps<"/school/fees/[id]/students/[fsId]">["params"] }) {
  const { id, fsId } = await params;
  const fee = await getFee(id);
  const student = fee?.students.find((s) => s.id === fsId);
  if (!fee || !student) notFound();
  const status = payStatus(student.payableMinor, student.paidMinor);

  return (
    <>
      <PageHeader title={student.name} backHref={`/school/fees/${fee.id}`} />
      <Panel label="Status">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {fee.name}
            {student.className ? ` · ${student.className}` : ""}
          </span>
          <StatusPill status={status} />
        </div>
        <MoneyRow label="Should pay" minor={student.payableMinor} />
        <MoneyRow label="Paid (advance)" minor={student.paidMinor} />
        {status.kind === "part" || status.kind === "unpaid" ? <MoneyRow label="Balance to pay" minor={status.balanceMinor} strong /> : null}
      </Panel>

      {student.payments.length > 0 ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {student.payments.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center gap-2 py-1 pr-1 pl-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{formatDate(p.paidOn)}</span>
                  {p.note ? <span className="text-xs break-words text-muted-foreground">{p.note}</span> : null}
                </span>
                <span className="font-semibold tabular-nums">{ghs(p.amountMinor)}</span>
                <ActionButton
                  action={deleteFeePayment.bind(null, p.id)}
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

      <PayableForm action={setPayable.bind(null, student.id, fee.id)} payable={formatAmountForInput(student.payableMinor)} />

      {student.payments.length === 0 ? (
        <ActionButton
          action={removeFeeStudent.bind(null, student.id, fee.id)}
          variant="ghost"
          confirm={{ title: `Take ${student.name} off this fee?`, description: "They have no payments on it.", yes: "Take off" }}
        >
          Take off this fee
        </ActionButton>
      ) : null}
    </>
  );
}
