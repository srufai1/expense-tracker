import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRateDate } from "@/lib/fx";

import { signOut } from "../actions";
import { getAvatar } from "./avatar-data";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountCard } from "./delete-account-card";
import { setWeeklyEmail } from "./email-actions";
import { getEmailSettings } from "./email-data";
import { ProfilePhotoCard } from "./profile-photo-card";
import { ThemePicker } from "./theme-picker";
import { WeeklyEmailSwitch } from "./weekly-email-switch";

export const metadata: Metadata = { title: "Settings" };

// Settings (D-47), opened from the profile menu or More: the signed-in
// account and profile photo (D-50), Change password (D-48), the Monday
// email, the theme, Sign out, and Delete my account (D-51).
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" backHref="/more" />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="h-28 text-sm text-muted-foreground">Loading…</p>}>
            <AccountEmail />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
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

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Delete my account</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccountCard />
        </CardContent>
      </Card>
    </>
  );
}

// The signed-in email and the profile photo (D-50).
async function AccountEmail() {
  const avatar = await getAvatar();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm break-words text-muted-foreground">
        Signed in as <span className="font-semibold text-foreground">{avatar.email}</span>
      </p>
      <ProfilePhotoCard userId={avatar.userId} email={avatar.email} url={avatar.url} />
    </div>
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
