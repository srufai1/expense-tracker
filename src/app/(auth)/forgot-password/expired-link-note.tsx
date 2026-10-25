"use client";

import { useSearchParams } from "next/navigation";

// Shown when a reset link could not be used: too old, used already, or
// opened in another browser than the one that asked for it.
export function ExpiredLinkNote() {
  if (useSearchParams().get("link") !== "expired") return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
      That reset link has expired or was opened in another browser. Ask for a new one below, and open it on this
      device, in this browser.
    </p>
  );
}
