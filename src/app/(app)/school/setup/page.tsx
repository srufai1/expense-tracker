import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";

import { getGhsAccounts, getSchoolSettings } from "../data";
import { SetupForm } from "../forms";
import { setUpSchoolMoney } from "../morning-actions";

export const metadata: Metadata = { title: "School money account" };

export default function SchoolSetupPage() {
  return (
    <>
      <PageHeader title="School money account" backHref="/school" />
      <Suspense fallback={<div className="h-40 rounded-2xl bg-muted" aria-hidden="true" />}>
        <Setup />
      </Suspense>
    </>
  );
}

async function Setup() {
  const [accounts, settings] = await Promise.all([getGhsAccounts(), getSchoolSettings()]);
  return (
    <>
      <SetupForm action={setUpSchoolMoney} accounts={accounts} current={settings?.accountId} />
      <ViewDetails>
        New collections go into the account you choose. Money already recorded stays in the account it went into.
      </ViewDetails>
    </>
  );
}
