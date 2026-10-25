import "server-only";

import { requireUser } from "@/lib/auth";
import { AVATAR_BUCKET, AVATAR_URL_SECONDS, avatarPath } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";

// The profile photo as a signed URL (D-50), or null when there is none.
// Also the user, whom the profile button and the upload need.
export async function getAvatar(): Promise<{ userId: string; email: string | null; url: string | null }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath(user.id), AVATAR_URL_SECONDS);
  // "Object not found" means no photo yet.
  return { userId: user.id, email: user.email, url: error ? null : data.signedUrl };
}
