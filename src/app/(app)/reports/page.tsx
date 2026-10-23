import type { Metadata } from "next";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" />
      <ComingSoon what="The weekly, monthly, custom and year reports" step="steps 9–10" />
    </>
  );
}
