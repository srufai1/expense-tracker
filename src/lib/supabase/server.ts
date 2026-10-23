import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// Create a new one for every request; never share one between requests.
export async function createClient() {
  // Read the request's cookies first. During `next build` this is where
  // pre-rendering stops (Cache Components), so a build never needs the
  // Supabase settings.
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies. That is fine here:
          // the proxy (src/proxy.ts) refreshes the session cookie on
          // every request before the page renders.
        }
      },
    },
  });
}
