import { connection, type NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Where the password reset email's link comes back (D-48). Supabase adds a
// one-time `code`; swapping it for a session signs the person in on this
// browser, then they choose a new password. The code only works in the
// browser that asked for the email (it was started there).
export async function GET(request: NextRequest) {
  await connection();
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }
  redirect("/forgot-password?link=expired");
}
