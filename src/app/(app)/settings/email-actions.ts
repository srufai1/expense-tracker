"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Turns the Monday email on or off (D-17). Returns an error message, or
// nothing on success (D-31 pop-up on failure).
export async function setWeeklyEmail(on: boolean): Promise<string | undefined> {
  await requireUser();
  // A server action can be called with anything: accept a real boolean only.
  if (typeof on !== "boolean") return "Choose on or off.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ weekly_email: on }, { onConflict: "user_id" });
  if (error) return "Check your internet connection and try again.";
  revalidatePath("/more");
}
