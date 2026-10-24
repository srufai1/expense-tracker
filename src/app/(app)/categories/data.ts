import "server-only";

import { requireUser } from "@/lib/auth";
import type { CategoryRow } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = "id, kind, parent_id, name, system_key, sort_order, archived_at";

type Row = {
  id: string;
  kind: CategoryRow["kind"];
  parent_id: string | null;
  name: string;
  system_key: string | null;
  sort_order: number;
  archived_at: string | null;
};

function toCategory(row: Row): CategoryRow {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    name: row.name,
    systemKey: row.system_key,
    sortOrder: row.sort_order,
    archived: row.archived_at !== null,
  };
}

// All of the signed-in user's categories. The first time (no Fees & Charges
// yet) it creates the starter list in the database, then reads again.
export async function getCategories(): Promise<CategoryRow[]> {
  await requireUser();
  const supabase = await createClient();

  const read = async () => {
    const { data, error } = await supabase.from("categories").select(COLUMNS);
    if (error) throw new Error(`Could not load categories: ${error.message}`);
    return data;
  };

  let data = await read();
  if (!data.some((row) => row.system_key === "fees")) {
    const seeded = await supabase.rpc("seed_starter_categories");
    if (seeded.error) throw new Error(`Could not create the starter categories: ${seeded.error.message}`);
    data = await read();
  }

  return data.map(toCategory);
}
