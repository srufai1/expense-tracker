// After sign-in we send the user back to the page they asked for, taken
// from the `?next=` query value. That value comes from the URL, so anyone
// can set it. Only allow paths inside this app: "/reports" is fine,
// "https://evil.example" or "//evil.example" is not.
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  // "//host" and "/\host" are treated by browsers as another website.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Never send the user back to the sign-in page itself.
  if (next === "/sign-in" || next.startsWith("/sign-in?")) return fallback;
  return next;
}
