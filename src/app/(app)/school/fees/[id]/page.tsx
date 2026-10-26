import { Pencil, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { formatDate } from "@/lib/dates";
import { feeTotals, owes, payStatus, RECIPIENTS } from "@/lib/school/fees";

import { getFee, getHeld } from "../../data";
import { FilterLinks, ghs, LinkRow, MoneyRow, Panel, StatusPill, statusDetail, Tiles } from "../../ui";

export const metadata: Metadata = { title: "Fee" };

export default function FeePage(props: PageProps<"/school/fees/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-muted" aria-hidden="true" />}>
      <Fee params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Fee({
  params,
  searchParams,
}: {
  params: PageProps<"/school/fees/[id]">["params"];
  searchParams: PageProps<"/school/fees/[id]">["searchParams"];
}) {
  const [{ id }, { show: param }] = await Promise.all([params, searchParams]);
  const [fee, held] = await Promise.all([getFee(id), getHeld()]);
  if (!fee) notFound();
  const show = param === "owing" || param === "paid" ? param : "all";
  const totals = feeTotals(fee.students);
  const holding = held.byFee.get(fee.id) ?? 0;
  const handedOver = fee.handovers.reduce((t, h) => t + h.amountMinor, 0);
  const students = fee.students.filter((s) => {
    if (show === "all") return true;
    return owes(payStatus(s.payableMinor, s.paidMinor)) === (show === "owing");
  });
  const base = `/school/fees/${fee.id}`;

  return (
    <>
      <PageHeader
        title={fee.name}
        backHref="/school"
        actions={
          <Button asChild variant="outline" size="icon" className="size-11">
            <Link href={`${base}/edit`} aria-label="Change the fee">
              <Pencil aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <Panel label="Totals">
        <Tiles
          items={[
            { label: "Collected", minor: totals.collectedMinor },
            { label: "Still to pay", minor: totals.stillToPayMinor, tone: totals.stillToPayMinor > 0 ? "warn" : undefined },
          ]}
        />
        <ViewDetails>
          <span className="flex flex-col gap-1">
            <MoneyRow label="Handed over" minor={handedOver} />
            <MoneyRow label="Holding now" minor={holding} strong />
            <span>
              {ghs(fee.amountMinor)} per student · {totals.done} of {fee.students.length} done
            </span>
          </span>
        </ViewDetails>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild className="h-11">
          <Link href={`${base}/pay`}>+ Payment</Link>
        </Button>
        <Button asChild variant="secondary" className="h-11">
          <Link href={`${base}/hand-over`}>Hand over…</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href={`${base}/my-part`}>Record my part</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href={`${base}/students`}>
            <UserPlus aria-hidden="true" /> Students
          </Link>
        </Button>
      </div>

      <FilterLinks
        base={base}
        current={show}
        options={[
          { value: "all", label: `All ${fee.students.length}` },
          { value: "owing", label: `Balance ${totals.owing}` },
          { value: "paid", label: `Paid ${totals.done}` },
        ]}
      />
      {students.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          {fee.students.length === 0 ? "No students yet. Add them with + Payment or Students." : "Nobody here."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {students.map((s) => {
            const status = payStatus(s.payableMinor, s.paidMinor);
            return (
              <li key={s.id}>
                <LinkRow
                  href={`${base}/students/${s.id}`}
                  title={s.name}
                  detail={[s.className, statusDetail(status, s.paidMinor)].filter(Boolean).join(" · ")}
                  right={<StatusPill status={status} />}
                />
              </li>
            );
          })}
        </ul>
      )}

      {fee.handovers.length > 0 ? (
        <ViewDetails label="Hand-over history">
          <span className="flex flex-col gap-1">
            {fee.handovers.map((h) => (
              <MoneyRow key={h.id} label={`${RECIPIENTS[h.toWhom]} · ${formatDate(h.handedOn)}`} minor={h.amountMinor} sign="−" />
            ))}
          </span>
        </ViewDetails>
      ) : null}
    </>
  );
}
