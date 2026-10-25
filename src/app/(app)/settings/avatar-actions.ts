"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { AVATAR_BUCKET, avatarPath } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";

// Removes the profile photo (D-50). Returns an error message, or nothing.
export async function removeAvatar(): Promise<string | undefined> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(user.id)]);
  if (error) return "Check your internet connection and try again.";
  // Every page's header shows the photo.
  revalidatePath("/", "layout");
}

// After an upload from the browser: every page's header shows the new photo.
export async function avatarChanged(): Promise<void> {
  await requireUser();
  revalidatePath("/", "layout");
}
