import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatAmountForInput } from "@/lib/money";

import { updateTransaction } from "../actions";
import { getTransaction } from "../data";
import { getFormChoices } from "../form-choices";
import { TransactionForm } from "../transaction-form";
import { DeleteTransaction } from "./delete-transaction";

export const metadata: Metadata = { title: "Edit transaction" };

export default function EditTransactionPage(props: PageProps<"/activity/[id]">) {
  return (
    <>
      <PageHeader title="Edit transaction" backHref="/activity" />
      {/* The id comes from the address (request data), so the form renders
          inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <EditTransaction params={props.params} />
      </Suspense>
    </>
  );
}

async function EditTransaction({ params }: { params: PageProps<"/activity/[id]">["params"] }) {
  const { id } = await params;
  const transaction = await getTransaction(id);
  // USD transactions are edited from build step 5, with their rate.
  if (!transaction || transaction.currency !== "GHS") notFound();

  const choices = await getFormChoices({ accountId: transaction.accountId, categoryId: transaction.categoryId });
  const backHref = `/activity?month=${transaction.occurredOn.slice(0, 7)}`;

  return (
    <>
      <TransactionForm
        action={updateTransaction.bind(null, transaction.id)}
        submitLabel="Save changes"
        categories={choices.categories}
        accounts={choices.accounts}
        initial={{
          kind: transaction.kind,
          amount: formatAmountForInput(transaction.amountMinor),
          categoryId: transaction.categoryId,
          accountId: transaction.accountId,
          occurredOn: transaction.occurredOn,
          note: transaction.note,
        }}
      />
      <DeleteTransaction id={transaction.id} backHref={backHref} />
    </>
  );
}
