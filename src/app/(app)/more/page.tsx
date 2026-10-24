import { ChevronRight, Download, Landmark, LogOut, Repeat, Tags, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

import { signOut } from "../actions";
import { ThemePicker } from "./theme-picker";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
        <AccountEmail />
      </Suspense>

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
          <span className="flex flex-1 flex-col">
            Export everything (Excel)
            <span className="text-xs font-normal text-muted-foreground">
              Accounts, transactions, budgets, goals and recurring items. Keep a copy each month.
            </span>
          </span>
        </a>
      </section>

      <ComingSoon what="The weekly email settings" step="step 12" />

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="outline" size="lg" className="h-12 w-full text-base text-destructive">
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return <p className="text-sm text-muted-foreground">{user.email}</p>;
}
