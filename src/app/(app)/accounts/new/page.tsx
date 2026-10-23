import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";

import { NewAccountForm } from "./new-account-form";

export const metadata: Metadata = { title: "New account" };

export default function NewAccountPage() {
  return (
    <>
      <PageHeader title="New account" backHref="/accounts" />
      {/* The form uses today's date in Accra, which differs per request,
          so it renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewAccountForm />
      </Suspense>
    </>
  );
}
