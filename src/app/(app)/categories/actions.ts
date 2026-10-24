"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  categoryDeleteError,
  categorySaveError,
  nextSortOrder,
  parseCategoryForm,
  type CategoryRow,
} from "@/lib/categories";
import { formValues } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

import type { CategoryFormState } from "./form-state";

const NO_CONNECTION = "Check your internet connection and try again.";

function failure(error: { code?: string; message: string }, values: Record<string, string>): CategoryFormState {
  const errors = categorySaveError(error.code, error.message);
  return errors ? { errors, values } : { errors: {}, formError: NO_CONNECTION, values };
}

export async function createCategory(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseCategoryForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  // New top-level categories go after the user's own ones (before Fees & Charges).
  let sortOrder = 0;
  if (parsed.value.parentId === null) {
    const { data, error } = await supabase
      .from("categories")
      .select("kind, parent_id, system_key, sort_order");
    if (error) return failure(error, values);
    const rows = data.map((row) => ({
      kind: row.kind,
      parentId: row.parent_id,
      systemKey: row.system_key,
      sortOrder: row.sort_order,
    })) as CategoryRow[];
    sortOrder = nextSortOrder(rows, parsed.value.kind);
  }

  const { error } = await supabase.from("categories").insert({
    kind: parsed.value.kind,
    parent_id: parsed.value.parentId,
    name: parsed.value.name,
    sort_order: sortOrder,
  });
  if (error) return failure(error, values);

  revalidatePath("/categories");
  redirect(`/categories?kind=${parsed.value.kind}`);
}

export async function updateCategory(
  id: string,
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseCategoryForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  // kind cannot change after creation (the database does not allow it).
  const { error, count } = await supabase
    .from("categories")
    .update({ name: parsed.value.name, parent_id: parsed.value.parentId }, { count: "exact" })
    .eq("id", id);
  if (error) return failure(error, values);
  if (count === 0) return { errors: {}, formError: "This category no longer exists.", values };

  revalidatePath("/categories");
  redirect(`/categories?kind=${parsed.value.kind}`);
}

// Archive hides a category from pickers; its history stays (D-32).
// Returns an error message, or redirects on success.
export async function setCategoryArchived(id: string, archived: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    return error.message.includes("categories_system_not_archived")
      ? "Fees & Charges is needed for transfer fees, so it cannot be archived."
      : NO_CONNECTION;
  }
  revalidatePath("/categories");
  redirect("/categories");
}

// Deletes an unused category. A used one is refused by the database (D-32).
export async function deleteCategory(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return categoryDeleteError(error.code, error.message);
  revalidatePath("/categories");
  redirect("/categories");
}
