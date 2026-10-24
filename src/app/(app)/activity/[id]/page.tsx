import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatAmountForInput } from "@/lib/money";

import { deleteTransaction, restoreTransaction, updateTransaction } from "../actions";
import { getEditable, type Transfer } from "../data";
import { removeReceipt, removeReceiptOfDeleted } from "../receipt-actions";
import { getReceipt } from "../receipt-data";
import { getFormChoices } from "../form-choices";
import { TransactionForm } from "../transaction-form";
import { deleteTransfer, restoreTransfer, saveTransfer } from "../transfer-actions";
import { TransferForm } from "../transfer-form";
import { DeleteTransaction } from "./delete-transaction";
import { ReceiptCard } from "./receipt-card";

export const metadata: Metadata = { title: "Edit transaction" };

export default function EditTransactionPage(props: PageProps<"/activity/[id]">) {
  return (
    <>
      <PageHeader title="Edit" backHref="/activity" />
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
  const editable = await getEditable(id);
  if (!editable) notFound();
  // A fee is changed through its transfer (D-07).
  if (editable.kind === "fee") redirect(`/activity/${editable.transferId}`);
  if (editable.kind === "transfer") return <EditTransfer transfer={editable.transfer} />;

  const transaction = editable.transaction;
  const choices = await getFormChoices({ accountIds: [transaction.accountId], categoryId: transaction.categoryId });
  const backHref = `/activity?month=${transaction.occurredOn.slice(0, 7)}`;

  return (
    <>
      <TransactionForm
        action={updateTransaction.bind(null, transaction.id)}
        submitLabel="Save changes"
        categories={choices.categories}
        accounts={choices.accounts}
        rates={choices.rates}
        // Keep the stored rate and account amount (M-2) unless changed.
        keepTyped
        initial={{
          kind: transaction.kind,
          amount: formatAmountForInput(transaction.amountMinor),
          currency: transaction.currency,
          categoryId: transaction.categoryId,
          accountId: transaction.accountId,
          occurredOn: transaction.occurredOn,
          rate: transaction.currency === "USD" ? transaction.rate : "",
          accountAmount: formatAmountForInput(transaction.accountAmountMinor),
          note: transaction.note,
        }}
      />
      <Suspense fallback={<div className="h-32 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Receipt transactionId={transaction.id} />
      </Suspense>
      <DeleteTransaction
        thing="transaction"
        backHref={backHref}
        onDelete={deleteTransaction.bind(null, transaction.id)}
        onRestore={restoreTransaction}
        onGone={removeReceiptOfDeleted.bind(null, transaction.id)}
      />
    </>
  );
}

async function EditTransfer({ transfer }: { transfer: Transfer }) {
  // Archived accounts this transfer uses stay choices.
  const choices = await getFormChoices({ accountIds: [transfer.fromAccountId, transfer.toAccountId] });
  const backHref = `/activity?month=${transfer.occurredOn.slice(0, 7)}`;

  return (
    <>
      <TransferForm
        action={saveTransfer.bind(null, transfer.id)}
        submitLabel="Save changes"
        accounts={choices.accounts}
        rates={choices.rates}
        // Keep the stored rate (M-2) unless changed.
        keepRate
        initial={{
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: formatAmountForInput(transfer.amountMinor),
          received: formatAmountForInput(transfer.receivedMinor),
          fee: transfer.feeMinor === null ? "" : formatAmountForInput(transfer.feeMinor),
          occurredOn: transfer.occurredOn,
          rate: transfer.currency === "USD" ? transfer.rate : "",
          note: transfer.note,
        }}
      />
      <Suspense fallback={<div className="h-32 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Receipt transactionId={transfer.id} />
      </Suspense>
      <DeleteTransaction
        thing="transfer"
        backHref={backHref}
        onDelete={deleteTransfer.bind(null, transfer.id)}
        onRestore={restoreTransfer}
        onGone={removeReceiptOfDeleted.bind(null, transfer.id)}
      />
    </>
  );
}

// The receipt photo (D-10): any transaction may have one.
async function Receipt({ transactionId }: { transactionId: string }) {
  const receipt = await getReceipt(transactionId);
  return (
    <ReceiptCard
      transactionId={transactionId}
      userId={receipt.userId}
      url={receipt.url}
      onRemove={removeReceipt.bind(null, transactionId)}
    />
  );
}
