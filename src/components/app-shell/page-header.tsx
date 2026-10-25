import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { ProfileButton } from "./profile-button";

// The title row at the top of each signed-in page. `backHref` adds a back
// arrow for pages that sit below a menu page (for example Accounts → Edit).
// The round profile button sits at the far right of every page (D-47).
// It is pinned to the top right; the page's own buttons (`actions`) stay on
// the title row when there is room and move to a second row when there is
// not (Accounts at 360 px), so the title is never cut and nothing is hidden.
export function PageHeader({
  title,
  actions,
  backHref,
}: {
  title: string;
  actions?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="relative min-h-11 pr-[52px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex max-w-full min-w-0 shrink-0 items-center gap-1">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </Link>
          ) : null}
          <h1 className="truncate text-[22px] font-extrabold tracking-tight">{title}</h1>
        </div>
        {actions ? <div className="ml-auto flex items-center">{actions}</div> : null}
      </div>
      <div className="absolute top-0 right-0">
        <Suspense fallback={<span className="block size-11 rounded-full bg-muted" aria-hidden="true" />}>
          <ProfileButton />
        </Suspense>
      </div>
    </header>
  );
}
