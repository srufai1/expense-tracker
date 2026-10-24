import { createHash, timingSafeEqual } from "node:crypto";

// The daily job's route is open to the internet, so it only runs when the
// request carries `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron
// sends (DESIGN §3, security rule 2).
//
// A secret shorter than 32 characters counts as not set: guessable.
// Comparing hashes in constant time does not reveal how much of a guess
// was right.
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
