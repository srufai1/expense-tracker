import type { Metadata } from "next";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" />
      <ComingSoon what="The transaction list" step="step 4" />
    </>
  );
}
