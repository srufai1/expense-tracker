// Signed out after two hours without activity (D-49).
//
// The proxy reads a cookie with the time of the last request. Sign-in,
// sign-up and the reset link write it; every signed-in request moves it on.
// While the app is open, IdleSignOut (src/components/app-shell) watches
// taps and keys, signs out after two quiet hours, and every few minutes of
// activity makes a small request so the cookie stays current.

export const IDLE_LIMIT_MS = 120 * 60 * 1000;
export const IDLE_COOKIE = "et_last_active";

export const idleCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  // Longer than any idle time, so a missing cookie means "never written".
  maxAge: 60 * 60 * 24 * 30,
} as const;

export type IdleAction = "none" | "touch" | "sign-out";

export function idleCheck(state: { signedIn: boolean; lastActive: string | undefined; now: number }): IdleAction {
  if (!state.signedIn) return "none";
  const last = Number(state.lastActive);
  if (!state.lastActive || !Number.isFinite(last)) return "sign-out";
  return state.now - last >= IDLE_LIMIT_MS ? "sign-out" : "touch";
}
