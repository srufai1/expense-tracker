import { ArrowLeftRight, Receipt, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { todayInAccra } from "@/lib/dates";

import { createTransaction } from "../activity/actions";
import { getFormChoices } from "../activity/form-choices";
import { TransactionForm } from "../activity/transaction-form";
import { saveTransfer } from "../activity/transfer-actions";
import { TransferForm } from "../activity/transfer-form";

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

  if (kind === "transfer") {
    if (choices.accounts.length < 2) {
      return (
        <section className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-bold">A transfer needs two accounts</h2>
          <p className="text-sm text-muted-foreground">Add the account you want to move money to.</p>
          <Button asChild className="h-11">
            <Link href="/accounts/new">Add an account</Link>
          </Button>
        </section>
      );
    }
    return (
      <>
        <BackToEntry />
        <TransferForm
          action={saveTransfer.bind(null, null)}
          submitLabel="Save transfer"
          accounts={choices.accounts}
          rates={choices.rates}
          initial={{
            fromAccountId: "",
            toAccountId: "",
            amount: "",
            received: "",
            fee: "",
            occurredOn: todayInAccra(),
            rate: "",
            note: "",
          }}
        />
      </>
    );
  }

  // One account: choose it already, with its currency.
  const only = choices.accounts.length === 1 ? choices.accounts[0] : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {choices.accounts.length > 1 ? (
          <Button asChild variant="outline" className="h-11">
            <Link href="/add?kind=transfer">
              <ArrowLeftRight aria-hidden="true" />
              Move money between accounts
            </Link>
          </Button>
        ) : null}
        {/* Screen 2 "repeat": a recurring item is set up on its own screen. */}
        <Button asChild variant="outline" className="h-11">
          <Link href="/recurring/new">
            <Repeat aria-hidden="true" />
            Repeats? Make it recurring
          </Link>
        </Button>
      </div>
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
    </>
  );
}

// Back from the transfer form to expense or income.
function BackToEntry() {
  return (
    <Button asChild variant="outline" className="h-11 self-start">
      <Link href="/add">
        <Receipt aria-hidden="true" />
        Expense or income instead
      </Link>
    </Button>
  );
}
