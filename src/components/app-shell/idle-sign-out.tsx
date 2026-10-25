"use client";

import { useEffect } from "react";

import { keepAlive, signOutIdle } from "@/app/(app)/actions";
import { IDLE_LIMIT_MS } from "@/lib/idle";

// Signs out after 20 minutes without a tap, key press or scroll (D-49).
// While someone is active, it makes a small request every 5 minutes, so the
// server's idle clock (the proxy) knows; a long form is never lost to it.
// When the phone wakes a sleeping app, it checks how long it was away.
const KEEP_ALIVE_EVERY_MS = 5 * 60 * 1000;
const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export function IdleSignOut() {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastKeepAlive = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let signingOut = false;

    const expire = () => {
      if (signingOut) return;
      signingOut = true;
      void signOutIdle();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, IDLE_LIMIT_MS);
    };
    const onActivity = () => {
      lastActivity = Date.now();
      arm();
      if (lastActivity - lastKeepAlive >= KEEP_ALIVE_EVERY_MS) {
        lastKeepAlive = lastActivity;
        void keepAlive();
      }
    };
    // Timers sleep with the phone, so check the time on waking.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity >= IDLE_LIMIT_MS) expire();
    };

    ACTIVITY.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    arm();
    return () => {
      clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
