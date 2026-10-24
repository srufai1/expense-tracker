import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ArchiveDeleteZone } from "@/components/archive-delete-zone";
import { todayInAccra } from "@/lib/dates";
import { formatAmountForInput } from "@/lib/money";

import { AccountForm } from "../account-form";
import { deleteAccount, setAccountArchived, updateAccount } from "../actions";
import { getAccount } from "../data";

export const metadata: Metadata = { title: "Edit account" };

export default function EditAccountPage(props: PageProps<"/accounts/[id]">) {
  return (
    <>
      <PageHeader title="Edit account" backHref="/accounts" />
      {/* The account id comes from the address (request data), so the form
          renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <EditAccount params={props.params} />
      </Suspense>
    </>
  );
}

async function EditAccount({ params }: { params: PageProps<"/accounts/[id]">["params"] }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  return (
    <>
      <AccountForm
        action={updateAccount.bind(null, account.id)}
        submitLabel="Save changes"
        today={todayInAccra()}
        currencyLocked={account.hasTransactions}
        initial={{
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalance: formatAmountForInput(account.openingBalanceMinor),
          openingBalanceOn: account.openingBalanceOn,
        }}
      />
      <ArchiveDeleteZone
        thing="account"
        name={account.name}
        archived={account.archived}
        onArchive={setAccountArchived.bind(null, account.id)}
        onDelete={deleteAccount.bind(null, account.id)}
        archiveHint="Hides the account from lists and totals. Its history stays."
        unarchiveHint="Shows the account in lists and totals again."
      />
    </>
  );
}
