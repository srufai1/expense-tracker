import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { IDLE_COOKIE, idleCheck, idleCookieOptions } from "@/lib/idle";
import { getRedirect } from "@/lib/route-guard";

import { isSupabaseAuthCookie } from "./auth-cookies";
import { getSupabaseEnv } from "./env";

// Runs before every page request (see src/proxy.ts). It does three jobs:
// 1. Refreshes the Supabase session cookie when it is about to expire.
// 2. Signs out a visitor idle for 20 minutes (D-49), and notes the time of
//    every other signed-in request.
// 3. Sends signed-out visitors to /sign-in.
// This is only a first, fast check. Every page and Server Action still
// checks the user itself (src/lib/auth.ts), because a proxy is not a
// security boundary on its own.
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });
  // Headers Supabase asks us to send whenever it sets a session cookie.
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Stops a CDN from caching a response that carries a session cookie.
        cacheHeaders = { ...cacheHeaders, ...headers };
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Do not put any code between createServerClient and getClaims():
  // getClaims() is what refreshes an expiring session.
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  const signedIn = Boolean(data?.claims?.sub);

  // 20 minutes idle (D-49). Not on the reset link's return address (it is
  // about to start a new session) or the daily job (no session).
  const idle = pathname.startsWith("/auth/") || pathname.startsWith("/api/cron")
    ? "none"
    : idleCheck({ signedIn, lastActive: request.cookies.get(IDLE_COOKIE)?.value, now: Date.now() });
  if (idle === "sign-out") {
    await supabase.auth.signOut({ scope: "local" });
    const redirect = redirectWithCookies(new URL("/sign-in?reason=idle", request.url), response, cacheHeaders);
    // If Supabase could not be reached, it keeps the session cookies; this
    // device must be signed out anyway (as in the Sign out action).
    request.cookies.getAll()
      .filter((cookie) => isSupabaseAuthCookie(cookie.name))
      .forEach((cookie) => redirect.cookies.delete(cookie.name));
    redirect.cookies.delete(IDLE_COOKIE);
    return redirect;
  }

  // The rules for who goes where live in src/lib/route-guard.ts (tested).
  const target = getRedirect({ pathname, search, signedIn });
  const result = target ? redirectWithCookies(new URL(target, request.url), response, cacheHeaders) : response;
  if (idle === "touch") result.cookies.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions);
  return result;
}

// A redirect must carry any cookie Supabase just set (for example a
// cleared, expired session), or the browser keeps the stale one.
function redirectWithCookies(
  url: URL,
  from: NextResponse,
  cacheHeaders: Record<string, string>,
) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(cacheHeaders).forEach(([key, value]) =>
    redirect.headers.set(key, value),
  );
  return redirect;
}
