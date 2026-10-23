import "server-only";

import { redirect } from "next/navigation";

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
// <Suspense> boundary (never at the top of a layout).
export async function requireUser(): Promise<CurrentUser> {
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
