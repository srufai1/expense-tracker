import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { accountTypeLabel, totalInGhs, totalsByCurrency } from "@/lib/accounts";
import { todayInAccra } from "@/lib/dates";
import { formatRateDate } from "@/lib/fx";

import { getRateFor } from "../activity/rates";
import { AccountTypeIcon } from "./account-type-icon";
import { getAccounts, type Account } from "./data";
import { MoneyText } from "./money-text";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        backHref="/more"
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href="/accounts/new">
              <Plus aria-hidden="true" />
              Add
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading accounts…</p>}>
        <AccountsList />
      </Suspense>
    </>
  );
}

async function AccountsList() {
  const accounts = await getAccounts();
  const active = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-bold">No accounts yet</h2>
        <p className="text-sm text-muted-foreground">
          Add where your money is: cash, bank, Mobile Money or a card, with today&apos;s balance.
        </p>
        <Button asChild className="h-11">
          <Link href="/accounts/new">Add your first account</Link>
        </Button>
      </section>
    );
  }

  const totals = totalsByCurrency(active);
  const hasUsd = active.some((account) => account.currency === "USD");
  const latest = hasUsd ? await getRateFor(todayInAccra()) : null;
  const total = totalInGhs(active, latest?.rate ?? null);

  return (
    <>
      <section className="flex flex-col gap-1 px-1" aria-label="Totals">
        <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Total in GHS</span>
        <MoneyText minor={total.ghsMinor} currency="GHS" className="text-3xl font-extrabold tracking-tight" />
        {hasUsd ? (
          <span className="text-sm text-muted-foreground">
            {total.usdConverted && latest ? (
              <>
                Includes <MoneyText minor={totals.USD} currency="USD" className="font-semibold text-foreground" />{" "}
                at {latest.rate} (rate from {formatRateDate(latest.rateDate)}).
              </>
            ) : (
              <>
                Plus <MoneyText minor={totals.USD} currency="USD" className="font-semibold text-foreground" /> in
                USD accounts. No exchange rate is stored yet to convert it.
              </>
            )}
          </span>
        ) : null}
      </section>

      <AccountList accounts={active} />

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Archived</h2>
          <AccountList accounts={archived} muted />
        </section>
      ) : null}
    </>
  );
}

function AccountList({ accounts, muted = false }: { accounts: Account[]; muted?: boolean }) {
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link
            href={`/accounts/${account.id}`}
            className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${muted ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}
            >
              <AccountTypeIcon type={account.type} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`line-clamp-2 font-bold break-words ${muted ? "text-muted-foreground" : ""}`}>{account.name}</span>
              <span className="text-xs text-muted-foreground">
                {accountTypeLabel(account.type)} · {account.currency}
              </span>
            </span>
            <MoneyText minor={account.balanceMinor} currency={account.currency} className="font-bold" />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
