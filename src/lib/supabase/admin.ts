import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

// Supabase client with the SECRET key. It bypasses Row-Level Security, so it
// is used in two places only, both without a signed-in user (DESIGN §3,
// security rule 1): the daily job (src/app/api/cron/daily), and the invite
// sign-up action (src/app/(auth)/sign-up), after the invite code matched
// (D-45). Never import it into a page, another Server Action or a client
// component.
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY (needed by the daily job only).");

  return createClient<Database>(url, secretKey, {
    // No session: this client never signs in as a user.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
