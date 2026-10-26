import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell/page-header";

import { saveFee } from "../../fee-actions";
import { FeeForm } from "../../forms";

export const metadata: Metadata = { title: "New fee" };

export default function NewFeePage() {
  return (
    <>
      <PageHeader title="New fee" backHref="/school" />
      <FeeForm action={saveFee.bind(null, null)} submitLabel="Add fee" />
    </>
  );
}
