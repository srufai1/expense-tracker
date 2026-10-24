// Postgres error codes the app explains to the user.

// True when a row cannot be deleted because other rows still point at it
// (ON DELETE RESTRICT). Postgres 18 reports this as 23001; older versions
// as 23503 (foreign key violation). Supabase may run either.
export function isStillUsed(code: string | undefined): boolean {
  return code === "23503" || code === "23001";
}
