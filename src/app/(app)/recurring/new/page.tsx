import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { todayInAccra } from "@/lib/dates";

import { getFormChoices } from "../../activity/form-choices";
import { saveRule } from "../actions";
import { RecurringForm } from "../recurring-form";

export const metadata: Metadata = { title: "New recurring item" };

export default function NewRecurringPage() {
  return (
    <>
      <PageHeader title="New recurring item" backHref="/recurring" />
      {/* Reads the user's accounts and today's date, so it renders inside
          a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewRule />
      </Suspense>
    </>
  );
}

async function NewRule() {
  const choices = await getFormChoices();
  const today = todayInAccra();
  return (
    <RecurringForm
      action={saveRule.bind(null, null)}
      submitLabel="Save recurring item"
      categories={choices.categories}
      accounts={choices.accounts}
      initial={{
        kind: "expense",
        amount: "",
        currency: "GHS",
        categoryId: "",
        accountId: choices.accounts.length === 1 ? choices.accounts[0].id : "",
        toAccountId: "",
        frequency: "monthly",
        weekday: "1",
        dayOfMonth: String(Number(today.slice(8, 10))),
        startsOn: today,
        endsOn: "",
        note: "",
      }}
    />
  );
}
