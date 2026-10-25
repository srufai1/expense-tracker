import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatRateDate } from "@/lib/fx";

import { signOut } from "../actions";
import { setWeeklyEmail } from "./email-actions";
import { getEmailSettings } from "./email-data";
import { ThemePicker } from "./theme-picker";
import { WeeklyEmailSwitch } from "./weekly-email-switch";

export const metadata: Metadata = { title: "Settings" };

// Settings (D-47), opened from the profile menu or More: the signed-in
// account, the Monday email, the theme and Sign out. These were on More.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" backHref="/more" />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="h-5 text-sm text-muted-foreground">Loading…</p>}>
            <AccountEmail />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly email</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
            <WeeklyEmail />
          </Suspense>
        </CardContent>
      </Card>

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
  return (
    <p className="text-sm break-words text-muted-foreground">
      Signed in as <span className="font-semibold text-foreground">{user.email}</span>
    </p>
  );
}

// Screen 8: the Monday email (D-17) on or off, where it goes, and the last
// week sent.
async function WeeklyEmail() {
  const settings = await getEmailSettings();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Every Monday morning: last week&apos;s summary, budget alerts and suggestions, with the PDF report attached.
      </p>
      <WeeklyEmailSwitch on={settings.on} onChange={setWeeklyEmail} />
      <p className="text-xs break-words text-muted-foreground">
        Sent to {settings.address ?? "your sign-in address"}.
        {settings.last
          ? settings.last.status === "sent"
            ? ` Last sent for the week of ${formatRateDate(settings.last.weekStart)}.`
            : settings.last.status === "failed"
              ? ` The email for the week of ${formatRateDate(settings.last.weekStart)} could not be sent yet; it is tried again on the next run.`
              : ` The email for the week of ${formatRateDate(settings.last.weekStart)} could not be confirmed as sent. It is not sent again, so it never arrives twice.`
          : ""}
      </p>
    </div>
  );
}
