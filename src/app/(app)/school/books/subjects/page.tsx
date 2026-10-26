import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";
import { formatAmountForInput } from "@/lib/money";

import { saveBookSplit, saveSubject } from "../../book-actions";
import { getSchoolSettings, getSubjects } from "../../data";
import { BookSplitForm, SubjectForm } from "../../forms";
import { ghs, LinkRow, SectionTitle } from "../../ui";

export const metadata: Metadata = { title: "Subjects and prices" };

export default function SubjectsPage() {
  return (
    <>
      <PageHeader title="Subjects and prices" backHref="/school/books" />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Subjects />
      </Suspense>
    </>
  );
}

async function Subjects() {
  const [subjects, settings] = await Promise.all([getSubjects(), getSchoolSettings()]);
  return (
    <>
      {subjects.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {subjects.map((s) => (
            <li key={s.id}>
              <LinkRow
                href={`/school/books/subjects/${s.id}`}
                title={s.name}
                detail={s.archived ? "Hidden" : undefined}
                right={<span className="font-bold tabular-nums">{ghs(s.priceMinor)}</span>}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <h2 className="px-1 pt-2 text-base font-bold">Add a subject</h2>
      <SubjectForm action={saveSubject.bind(null, null)} submitLabel="Add subject" />

      {settings ? (
        <>
          <SectionTitle>Per book given out</SectionTitle>
          <BookSplitForm
            action={saveBookSplit}
            transport={formatAmountForInput(settings.bookTransportMinor)}
            mine={formatAmountForInput(settings.bookMineMinor)}
          />
          <ViewDetails>
            When a book is given out its price is divided: what that copy cost, transport, your part, and the rest to
            the teachers&apos; book fund. A dearer copy takes from the teachers first, then from your part. Books given
            out before a change keep their split.
          </ViewDetails>
        </>
      ) : null}
    </>
  );
}
