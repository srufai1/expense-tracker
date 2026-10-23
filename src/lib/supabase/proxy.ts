import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "./env";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/sign-in"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Runs before every page request (see src/proxy.ts). It does two jobs:
// 1. Refreshes the Supabase session cookie when it is about to expire.
// 2. Sends signed-out visitors to /sign-in.
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
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";
    if (pathname !== "/") signInUrl.searchParams.set("next", pathname + search);
    return redirectWithCookies(signInUrl, response, cacheHeaders);
  }

  if (signedIn && pathname === "/sign-in") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return redirectWithCookies(homeUrl, response, cacheHeaders);
  }

  return response;
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
