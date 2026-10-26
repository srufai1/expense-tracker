import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";

import { getFee } from "../../../data";
import { recordMyPart } from "../../../fee-actions";
import { MyPartForm } from "../../../forms";

export const metadata: Metadata = { title: "Record my part" };

export default function MyPartPage(props: PageProps<"/school/fees/[id]/my-part">) {
  return (
    <Suspense fallback={<div className="h-80 rounded-2xl bg-muted" aria-hidden="true" />}>
      <MyPart params={props.params} />
    </Suspense>
  );
}

async function MyPart({ params }: { params: PageProps<"/school/fees/[id]/my-part">["params"] }) {
  const { id } = await params;
  const fee = await getFee(id);
  if (!fee) notFound();
  return (
    <>
      <PageHeader title="Record my part" backHref={`/school/fees/${fee.id}`} />
      <p className="px-1 font-semibold">{fee.name}</p>
      <MyPartForm action={recordMyPart.bind(null, fee.id)} />
    </>
  );
}
