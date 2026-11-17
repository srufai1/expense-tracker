import { Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { todayInAccra } from "@/lib/dates";

import { createTransaction } from "../activity/actions";
import { getFormChoices } from "../activity/form-choices";
import { TransactionForm } from "../activity/transaction-form";
import { LEDGER_CHOICE } from "../activity/ledger-choice";

export const metadata: Metadata = { title: "New transaction" };

export default function AddPage(props: PageProps<"/add">) {
  return (
    <>
      <PageHeader title="New transaction" />
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewTransaction searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function NewTransaction({ searchParams }: { searchParams: PageProps<"/add">["searchParams"] }) {
  const [{ kind }, choices] = await Promise.all([searchParams, getFormChoices()]);
  return (
    <>
      <Button asChild variant="outline" className="h-11 self-start">
        <Link href="/recurring/new"><Repeat aria-hidden="true" /> Make it recurring</Link>
      </Button>
      <TransactionForm
        action={createTransaction}
        submitLabel="Save"
        categories={choices.categories}
        accounts={[LEDGER_CHOICE]}
        rates={choices.rates}
        initial={{
          kind: kind === "income" ? "income" : "expense",
          amount: "",
          currency: "GHS",
          categoryId: "",
          accountId: LEDGER_CHOICE.id,
          occurredOn: todayInAccra(),
          rate: "",
          accountAmount: "",
          note: "",
        }}
      />
    </>
  );
}
