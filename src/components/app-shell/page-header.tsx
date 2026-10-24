import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// The title row at the top of each signed-in page. `backHref` adds a back
// arrow for pages that sit below a menu page (for example Accounts → Edit).
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
    <header className="flex min-h-11 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
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
      {actions}
    </header>
  );
}
