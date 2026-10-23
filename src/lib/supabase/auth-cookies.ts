// Supabase keeps the session in cookies named "sb-<project>-auth-token".
// A large session is split into "...-auth-token.0", "...-auth-token.1", etc.
export function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token");
}
