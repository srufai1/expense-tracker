// When to show the "Install app" button (D-46). The app is a PWA: it can be
// added to the phone's home screen and then opens full screen, like an app.

export type InstallMode = "hidden" | "prompt" | "ios-help";

// iPhone, or an iPad (which says it is a Mac, but has a touch screen).
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

// - Already installed (opened from the home screen): nothing to do.
// - The browser offers its own install prompt (Android, Chrome, Edge): use it.
// - iPhone and iPad have no prompt: show the "Add to Home Screen" steps.
// - Any other browser cannot install the app: hide the button.
export function installMode(state: { standalone: boolean; canPrompt: boolean; ios: boolean }): InstallMode {
  if (state.standalone) return "hidden";
  if (state.canPrompt) return "prompt";
  if (state.ios) return "ios-help";
  return "hidden";
}
