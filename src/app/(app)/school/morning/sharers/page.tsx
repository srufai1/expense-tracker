import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";

import { ActionButton } from "../../action-button";
import { getSharers } from "../../data";
import { SharerForm } from "../../forms";
import { addSharer, setSharerArchived } from "../../morning-actions";
import { SectionTitle } from "../../ui";

export const metadata: Metadata = { title: "Sharers" };

export default function SharersPage() {
  return (
    <>
      <PageHeader title="Sharers" backHref="/school/morning" />
      <Suspense fallback={<div className="h-60 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Sharers />
      </Suspense>
    </>
  );
}

async function Sharers() {
  const sharers = await getSharers();
  const active = sharers.filter((s) => !s.archived);
  const hidden = sharers.filter((s) => s.archived);
  return (
    <>
      <ViewDetails>
        The JHS teachers and the headmaster who share the teachers&apos; money. Each week you tick who shares; the share
        is always equal. &quot;Me&quot; is you: your share becomes your income.
      </ViewDetails>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {active.map((s) => (
          <li key={s.id} className="flex min-h-13 items-center justify-between gap-2 py-1 pr-2 pl-4">
            <span className="font-semibold break-words">{s.name}</span>
            {s.isMe ? null : (
              <ActionButton action={setSharerArchived.bind(null, s.id, true)} variant="ghost">
                Hide
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      <h2 className="px-1 pt-2 text-base font-bold">Add a person</h2>
      <SharerForm action={addSharer} />
      {hidden.length > 0 ? (
        <>
          <SectionTitle>Hidden</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {hidden.map((s) => (
              <li key={s.id} className="flex min-h-13 items-center justify-between gap-2 py-1 pr-2 pl-4">
                <span className="break-words text-muted-foreground">{s.name}</span>
                <ActionButton action={setSharerArchived.bind(null, s.id, false)} variant="ghost">
                  Show
                </ActionButton>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
