"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
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

  redirect("/sign-in");
}
