"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { IDLE_COOKIE } from "@/lib/idle";
import { isSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  await endSession();
  redirect("/sign-in");
}

// Called by IdleSignOut after 20 minutes without activity (D-49). The
// sign-in page then says why.
export async function signOutIdle() {
  await endSession();
  redirect("/sign-in?reason=idle");
}

// Called by IdleSignOut every few minutes while someone is active on one
// page, so the proxy notes the activity (D-49). The request is the point.
export async function keepAlive() {}

async function endSession() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Supabase could not finish (for example: no internet and an expired
    // token it could not refresh). In that case it keeps the session
    // cookies, so delete them here: this device must be signed out anyway.
    const cookieStore = await cookies();
    cookieStore
      .getAll()
      .filter((cookie) => isSupabaseAuthCookie(cookie.name))
      .forEach((cookie) => cookieStore.delete(cookie.name));
  }
  (await cookies()).delete(IDLE_COOKIE);
}
