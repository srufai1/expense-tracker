import type { Metadata } from "next";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "New transaction" };

export default function AddPage() {
  return (
    <>
      <PageHeader title="New transaction" />
      <ComingSoon what="Adding a transaction" step="step 4" />
    </>
  );
}
