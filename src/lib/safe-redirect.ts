// After sign-in we send the user back to the page they asked for, taken
// from the `?next=` query value. That value comes from the URL, so anyone
// can set it. Only allow paths inside this app: "/reports" is fine,
// "https://evil.example" or "//evil.example" is not.
//
// The value is read with the standard URL parser, the same rules a browser
// follows. Checking the text by hand is not enough: browsers drop tabs and
// line breaks and treat "\" like "/", so "/<tab>/evil.example" becomes
// "//evil.example" — another website.
const APP_ORIGIN = "http://app.invalid";

export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(next, APP_ORIGIN);
  } catch {
    return fallback;
  }

  // Anything that resolves to another website is refused.
  if (url.origin !== APP_ORIGIN) return fallback;
  // Never send the user back to the sign-in page itself.
  if (url.pathname === "/sign-in" || url.pathname.startsWith("/sign-in/")) return fallback;

  // Return the cleaned-up path, not the raw text.
  return url.pathname + url.search + url.hash;
}
