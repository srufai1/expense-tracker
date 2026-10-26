import { ChevronRight, Download, Landmark, Repeat, Settings, Tags, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { ViewDetails } from "@/components/view-details";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />

      <nav aria-label="Money" className="overflow-hidden rounded-2xl border bg-card">
        <Link
          href="/accounts"
          className="flex min-h-13 items-center gap-3 px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Landmark className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Accounts</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
        <Link
          href="/categories"
          className="flex min-h-13 items-center gap-3 border-t px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Tags className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Categories</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
        <Link
          href="/recurring"
          className="flex min-h-13 items-center gap-3 border-t px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Repeat className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Recurring</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
        <Link
          href="/budgets"
          className="flex min-h-13 items-center gap-3 border-t px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Target className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Budgets &amp; goals</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
        <Link
          href="/settings"
          className="flex min-h-13 items-center gap-3 border-t px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Settings className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Settings</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      </nav>

      <section aria-labelledby="backup" className="flex flex-col gap-2">
        <h2 id="backup" className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Backup
        </h2>
        {/* A plain link: the file downloads instead of opening a page. */}
        <a
          href="/api/export.xlsx?scope=all"
          className="flex min-h-13 items-center gap-3 rounded-2xl border bg-card px-4 py-3 font-semibold hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Download className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Export everything (Excel)</span>
        </a>
        <ViewDetails className="px-1">
          Accounts, transactions, budgets, goals and recurring items. Keep a copy each month.
        </ViewDetails>
      </section>
    </>
  );
}
