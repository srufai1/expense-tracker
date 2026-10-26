import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatAmountForInput } from "@/lib/money";

import { ActionButton } from "../../../action-button";
import { getFee } from "../../../data";
import { saveFee, setFeeArchived } from "../../../fee-actions";
import { FeeForm } from "../../../forms";

export const metadata: Metadata = { title: "Change the fee" };

export default function EditFeePage(props: PageProps<"/school/fees/[id]/edit">) {
  return (
    <Suspense fallback={<div className="h-80 rounded-2xl bg-muted" aria-hidden="true" />}>
      <EditFee params={props.params} />
    </Suspense>
  );
}

async function EditFee({ params }: { params: PageProps<"/school/fees/[id]/edit">["params"] }) {
  const { id } = await params;
  const fee = await getFee(id);
  if (!fee) notFound();
  return (
    <>
      <PageHeader title="Change the fee" backHref={`/school/fees/${fee.id}`} />
      <FeeForm
        action={saveFee.bind(null, fee.id)}
        submitLabel="Save changes"
        initial={{ name: fee.name, amount: formatAmountForInput(fee.amountMinor) }}
      />
      <ViewDetails>A new amount applies to students added from now on. Change one student&apos;s amount on their page.</ViewDetails>
      <ActionButton action={setFeeArchived.bind(null, fee.id, !fee.archived)}>{fee.archived ? "Show on School money again" : "Archive this fee"}</ActionButton>
      <ViewDetails>Archive a finished fee to hide it from School money. Its history stays.</ViewDetails>
    </>
  );
}
