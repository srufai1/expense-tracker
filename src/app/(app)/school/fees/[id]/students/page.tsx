import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";

import { getFee } from "../../../data";
import { addStudentsToFee } from "../../../fee-actions";
import { StudentsForm } from "../../../forms";
import { ghs } from "../../../ui";

export const metadata: Metadata = { title: "Add students" };

export default function AddStudentsPage(props: PageProps<"/school/fees/[id]/students">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <AddStudents params={props.params} />
    </Suspense>
  );
}

async function AddStudents({ params }: { params: PageProps<"/school/fees/[id]/students">["params"] }) {
  const { id } = await params;
  const fee = await getFee(id);
  if (!fee) notFound();
  return (
    <>
      <PageHeader title="Add students" backHref={`/school/fees/${fee.id}`} />
      <p className="px-1 text-sm">
        <span className="font-semibold">{fee.name}</span> · {ghs(fee.amountMinor)} each
      </p>
      <StudentsForm action={addStudentsToFee.bind(null, fee.id)} />
    </>
  );
}
