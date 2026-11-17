import "server-only";

import { createClient } from "@/lib/supabase/server";

const NAME = "Unified personal ledger";

export async function getOrCreateLedger(supabase: Awaited<ReturnType<typeof createClient>>) {
  const lookup = () => supabase.from("accounts").select("id").ilike("name", NAME).eq("currency", "GHS").is("archived_at", null).maybeSingle();
  const { data, error } = await lookup();
  if (error || data) return { data, error };
  const created = await supabase.from("accounts").insert({ name: NAME, type: "cash", currency: "GHS" }).select("id").single();
  // Another request may have created the same ledger while this one was running.
  return created.error?.code === "23505" ? lookup() : created;
}
