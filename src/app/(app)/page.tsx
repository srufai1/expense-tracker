import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { totalInGhs, totalsByCurrency } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";

import { getAccounts } from "./accounts/data";
import { getRateFor } from "./activity/rates";
import { MoneyText } from "./accounts/money-text";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      {/* Reads the session, so it streams in behind a boundary while the
          rest of the page shows straight away. */}
      <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
        <SignedInAs />
      </Suspense>
      <Suspense fallback={<div className="h-32 rounded-2xl bg-muted" aria-hidden="true" />}>
        <BalanceCard />
      </Suspense>
      <ComingSoon what="This week's summary" step="steps 9–10" />
    </>
  );
}

async function SignedInAs() {
  const user = await requireUser();
  return (
    <p className="text-sm text-muted-foreground">
      Signed in as <span className="font-semibold text-foreground">{user.email}</span>
    </p>
  );
}

// First run: no accounts yet, so invite the user to add one. After that:
// the total balance, linking to the Accounts page.
async function BalanceCard() {
  const accounts = (await getAccounts()).filter((account) => !account.archived);

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl bg-primary p-5 text-primary-foreground">
        <h2 className="text-lg font-bold">Welcome! Start with your accounts</h2>
        <p className="text-sm opacity-90">
          Add each place your money sits — cash, bank, Mobile Money, card — with its balance today.
        </p>
        <Button asChild variant="secondary" className="h-11">
          <Link href="/accounts/new">Add your first account</Link>
        </Button>
      </section>
    );
  }

  const totals = totalsByCurrency(accounts);
  const hasUsd = accounts.some((account) => account.currency === "USD");
  const latest = hasUsd ? await getRateFor(todayInAccra()) : null;
  const total = totalInGhs(accounts, latest?.rate ?? null);

  return (
    <Link
      href="/accounts"
      className="flex items-center gap-3 rounded-2xl bg-primary p-5 text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-semibold opacity-90">Total balance · {accounts.length} accounts</span>
        <MoneyText
          minor={total.ghsMinor}
          currency="GHS"
          className="text-3xl font-extrabold tracking-tight text-primary-foreground"
        />
        {/* USD is shown separately only when no rate is stored to convert it (D-37). */}
        {hasUsd && !total.usdConverted ? (
          <span className="text-xs opacity-90">
            + <MoneyText minor={totals.USD} currency="USD" className="text-primary-foreground" />
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-5 opacity-80" aria-hidden="true" />
    </Link>
  );
}
