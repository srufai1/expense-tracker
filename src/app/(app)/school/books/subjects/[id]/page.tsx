import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatAmountForInput } from "@/lib/money";

import { saveSubject } from "../../../book-actions";
import { getSubjects } from "../../../data";
import { SubjectForm } from "../../../forms";

export const metadata: Metadata = { title: "Subject" };

export default function SubjectPage(props: PageProps<"/school/books/subjects/[id]">) {
  return (
    <>
      <PageHeader title="Subject" backHref="/school/books/subjects" />
      <Suspense fallback={<div className="h-40 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Subject params={props.params} />
      </Suspense>
    </>
  );
}

async function Subject({ params }: { params: PageProps<"/school/books/subjects/[id]">["params"] }) {
  const { id } = await params;
  const subject = (await getSubjects()).find((s) => s.id === id);
  if (!subject) notFound();
  return (
    <>
      <SubjectForm
        action={saveSubject.bind(null, subject.id)}
        submitLabel="Save changes"
        initial={{ name: subject.name, price: formatAmountForInput(subject.priceMinor) }}
      />
      <ViewDetails>A new price applies to books ordered from now on. Books already ordered keep their price.</ViewDetails>
    </>
  );
}
