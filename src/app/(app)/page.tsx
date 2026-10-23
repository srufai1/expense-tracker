import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      {/* Reads the session, so it streams in behind a boundary while the
          rest of the page shows straight away. */}
      <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
        <SignedInAs />
      </Suspense>
      <ComingSoon what="Your balances and this week's summary" step="steps 2–10" />
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
