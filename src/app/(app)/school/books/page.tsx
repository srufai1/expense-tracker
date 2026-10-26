import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { payStatus } from "@/lib/school/fees";

import { getBooksOverview } from "../data";
import { FilterLinks, ghs, LinkRow, MoneyRow, Panel, Pill, StatusPill } from "../ui";

export const metadata: Metadata = { title: "Past questions books" };

export default function BooksPage(props: PageProps<"/school/books">) {
  return (
    <>
      <PageHeader
        title="Past questions"
        backHref="/school"
        actions={
          <Button asChild variant="outline" size="icon" className="size-11">
            <Link href="/school/books/subjects" aria-label="Subjects and prices">
              <Settings2 aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Books searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Books({ searchParams }: { searchParams: PageProps<"/school/books">["searchParams"] }) {
  const { show: param } = await searchParams;
  const show = param === "give" || param === "owing" ? param : "all";
  const { subjects, students, paidInMinor, spentOnBooksMinor, given } = await getBooksOverview();
  // Paid for books not given out yet: not divided.
  const waitingMinor = paidInMinor - given.priceMinor;
  const list = students.filter((s) => {
    if (show === "give") return s.given < s.ordered;
    if (show === "owing") return s.paidMinor < s.payableMinor;
    return true;
  });

  return (
    <>
      <Panel label="Totals">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Waiting (not given)</div>
            <div className="text-base font-extrabold tabular-nums">{ghs(Math.max(0, waitingMinor))}</div>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Given out</div>
            <div className="text-base font-extrabold tabular-nums">
              {given.books} book{given.books === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <ViewDetails>
          <span className="flex flex-col gap-1">
            <MoneyRow label="Paid by students" minor={paidInMinor} />
            <MoneyRow label="Spent buying books" minor={spentOnBooksMinor} />
            <span className="pt-1 font-semibold">Books given out ({given.books}):</span>
            <MoneyRow label="Book cost" minor={given.costMinor} />
            <MoneyRow label="Transport" minor={given.transportMinor} />
            <MoneyRow label="Teachers' book fund" minor={given.teachersMinor} />
            <MoneyRow label="My income" minor={given.mineMinor} strong />
            <span>Money is divided only when a book is given out.</span>
          </span>
        </ViewDetails>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild className="h-11">
          <Link href="/school/books/pay">+ Payment</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/school/books/buy">+ Books bought</Link>
        </Button>
      </div>

      <Panel label="Stock">
        <h2 className="font-bold">Books</h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subjects yet.{" "}
            <Link href="/school/books/subjects" className="font-semibold underline">
              Add subjects and prices
            </Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-semibold">Subject</th>
                <th className="text-right font-semibold">Bought</th>
                <th className="text-right font-semibold">Given</th>
                <th className="text-right font-semibold">Left</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {subjects
                .filter((s) => !s.archived || s.bought > 0)
                .map((s) => (
                  <tr key={s.id}>
                    <td className="py-1 break-words">{s.name}</td>
                    <td className="text-right">{s.bought}</td>
                    <td className="text-right">{s.given}</td>
                    <td className="text-right font-bold">{s.bought - s.given}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Panel>

      <FilterLinks
        base="/school/books"
        current={show}
        options={[
          { value: "all", label: `All ${students.length}` },
          { value: "give", label: "To give" },
          { value: "owing", label: "Balance" },
        ]}
      />
      {list.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          {students.length === 0 ? "No students yet. Add one with + Payment." : "Nobody here."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {list.map((s) => {
            const toGive = s.ordered - s.given;
            const status = payStatus(s.payableMinor, s.paidMinor);
            return (
              <li key={s.id}>
                <LinkRow
                  href={`/school/books/students/${s.id}`}
                  title={s.name}
                  detail={`${s.className ? `${s.className} · ` : ""}Paid for ${s.ordered} · received ${s.given}`}
                  right={
                    toGive > 0 ? (
                      <>
                        <Pill tone="warn">{toGive} to give</Pill>
                        {status.kind === "part" || status.kind === "unpaid" ? <StatusPill status={status} /> : null}
                      </>
                    ) : status.kind === "part" || status.kind === "unpaid" ? (
                      <StatusPill status={status} />
                    ) : (
                      <Pill tone="ok">Done ✓</Pill>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
