// The visitor's network address, used to count wrong invite codes (D-49).
// On Vercel, x-forwarded-for is written by Vercel itself (its first entry
// is the visitor), so a visitor cannot choose it.
export function clientAddress(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return (first || "unknown").slice(0, 64);
}
