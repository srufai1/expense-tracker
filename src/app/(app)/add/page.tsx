import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { todayInAccra } from "@/lib/dates";

import { createTransaction } from "../activity/actions";
import { getFormChoices } from "../activity/form-choices";
import { TransactionForm } from "../activity/transaction-form";

export const metadata: Metadata = { title: "New transaction" };

export default function AddPage(props: PageProps<"/add">) {
  return (
    <>
      <PageHeader title="New transaction" />
      {/* Reads the user's accounts and today's date, which differ per
          request, so it renders inside a Suspense boundary. */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewTransaction searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function NewTransaction({ searchParams }: { searchParams: PageProps<"/add">["searchParams"] }) {
  const { kind } = await searchParams;
  const choices = await getFormChoices();

  if (choices.accounts.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-bold">Add an account first</h2>
        <p className="text-sm text-muted-foreground">
          A transaction needs an account: cash, bank, Mobile Money or a card.
        </p>
        <Button asChild className="h-11">
          <Link href="/accounts/new">Add an account</Link>
        </Button>
      </section>
    );
  }

  // One account: choose it already, with its currency.
  const only = choices.accounts.length === 1 ? choices.accounts[0] : null;
  return (
    <TransactionForm
      action={createTransaction}
      submitLabel="Save"
      categories={choices.categories}
      accounts={choices.accounts}
      rates={choices.rates}
      initial={{
        kind: kind === "income" ? "income" : "expense",
        amount: "",
        currency: only?.currency ?? "GHS",
        categoryId: "",
        accountId: only?.id ?? "",
        occurredOn: todayInAccra(),
        rate: "",
        accountAmount: "",
        note: "",
      }}
    />
  );
}
