// The message when sign-in, the invite code or the current password is
// locked after 5 failures (D-49). The lock itself lives in the database
// (supabase/migrations/20261025190000_auth_attempts.sql).
export function lockoutMessage(lockedUntil: string | Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 60_000));
  return `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
