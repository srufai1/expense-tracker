// Decides where the proxy sends a visitor before a page loads.
// Kept free of Next.js and Supabase so it can be tested on its own.

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/sign-in"];

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

  // A signed-in visitor has no reason to see the sign-in page.
  if (signedIn && pathname === "/sign-in") return "/";

  return null;
}
