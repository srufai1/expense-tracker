import { LogOut } from "lucide-react";
import type { Metadata } from "next";
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

      <ComingSoon
        what="Accounts, categories, budgets, recurring items, weekly email and export"
        step="steps 2–12"
      />

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
