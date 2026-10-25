// Decides where the proxy sends a visitor before a page loads.
// Kept free of Next.js and Supabase so it can be tested on its own.

// Paths anyone can open without signing in. The daily job (Vercel Cron)
// has no session; its route checks the CRON_SECRET header itself. Sign-up
// needs the invite code (D-45).
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/cron"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Returns the path to redirect to, or null to let the request through.
export function getRedirect({
  pathname,
  search,
  signedIn,
}: {
  pathname: string;
  search: string;
  signedIn: boolean;
}): string | null {
  if (!signedIn && !isPublicPath(pathname)) {
    // Remember where the visitor was going, so sign-in can send them back.
    if (pathname === "/") return "/sign-in";
    return `/sign-in?next=${encodeURIComponent(pathname + search)}`;
  }

  // A signed-in visitor has no reason to see the sign-in or sign-up page.
  if (signedIn && (pathname === "/sign-in" || pathname === "/sign-up")) return "/";

  return null;
}
