"use client";

import { Download, Share } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { appConfig } from "@/config/app";
import { installMode, isIos, type InstallMode } from "@/lib/install";
import { cn } from "@/lib/utils";

// "Install app" (D-46): puts the app on the phone's home screen. On Android,
// Chrome and Edge it opens the browser's own install prompt; on iPhone and
// iPad, which have none, it shows the "Add to Home Screen" steps. Hidden once
// the app is installed, and in browsers that cannot install it.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// The browser offers its prompt once, at any moment after the page loads, so
// it is caught here, as soon as this file loads, and kept for the button.
let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini bar away: the button offers it instead.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentMode(): InstallMode {
  const standalone =
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installMode({
    standalone,
    canPrompt: deferredPrompt !== null,
    ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
  });
}

// The server cannot know the browser, so the button appears after loading.
const serverMode = (): InstallMode => "hidden";

export function InstallAppButton({ className }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, currentMode, serverMode);
  const [stepsOpen, setStepsOpen] = useState(false);

  if (mode === "hidden" && !stepsOpen) return null;

  async function install() {
    if (mode === "ios-help") {
      setStepsOpen(true);
      return;
    }
    const prompt = deferredPrompt;
    if (!prompt) return;
    // A prompt can be shown only once; the browser offers a new one later.
    deferredPrompt = null;
    await prompt.prompt();
    await prompt.userChoice;
    notify();
  }

  return (
    <>
      {mode !== "hidden" ? (
        <button
          type="button"
          onClick={install}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-[#0B5D4B] shadow-sm focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none",
            className,
          )}
        >
          <Download className="size-4" aria-hidden="true" />
          Install app
        </button>
      ) : null}

      <AlertDialog open={stepsOpen} onOpenChange={setStepsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install {appConfig.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ol className="list-decimal space-y-2 pl-5 text-left">
                <li>
                  Tap the <strong>Share</strong> button{" "}
                  <Share className="inline size-4 align-text-bottom" aria-label="(a square with an arrow)" /> at the
                  bottom of Safari (at the top on iPad).
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong>. The app opens from your home screen, full screen.
                </li>
              </ol>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="h-11">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
