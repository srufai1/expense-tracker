import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

// Every page and Server Action that touches data calls this first.
// getClaims() verifies the session token, so Row-Level Security sees the
// signed-in user. Without a valid session it sends the user to /sign-in.
//
// It reads cookies, so with Cache Components it must run inside a
// <Suspense> boundary (never at the top of a layout), and never inside a
// "use cache" function (connection() throws there).
export async function requireUser(): Promise<CurrentUser> {
  // Check the session only during a real request. Partial Prefetching
  // otherwise pre-renders signed-in content with the user's cookies, and
  // getClaims() reads the clock (Date.now()) to test the token's expiry,
  // which Next.js rejects during a pre-render ("blocking-prerender-current-time").
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    redirect("/sign-in");
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
