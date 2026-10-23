// The message shown when signing in fails, chosen from the HTTP status
// Supabase returned. `undefined` or 0 means no answer arrived at all.
export function signInErrorMessage(status: number | undefined): string {
  if (status === 429) {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  // A 4xx answer means Supabase was reached and refused the details.
  // Anything else (no answer, or a server error) is a connection problem,
  // and saying "wrong password" then would be misleading.
  if (!status || status >= 500) {
    return "Could not reach the server. Check your internet connection and try again.";
  }
  // One message for every refusal, so the page never reveals whether an
  // email address has an account.
  return "That email and password do not match.";
}
