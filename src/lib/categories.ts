import { z } from "zod";

import { isStillUsed } from "./db-errors";

// DESIGN §6.2: two levels (Food → Groceries), expense or income.
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export type CategoryRow = {
  id: string;
  kind: CategoryKind;
  parentId: string | null;
  name: string;
  // "fees" for Fees & Charges, the system category (D-07).
  systemKey: string | null;
  sortOrder: number;
  archived: boolean;
};

export type CategoryNode = CategoryRow & { children: CategoryRow[] };

const byName = (a: CategoryRow, b: CategoryRow) => a.name.localeCompare(b.name);
const byOrder = (a: CategoryRow, b: CategoryRow) => a.sortOrder - b.sortOrder || byName(a, b);

// The categories of one kind as a two-level tree: top level in their own
// order, sub-categories A to Z. Archived ones (and the sub-categories of an
// archived parent) are left out unless asked for.
export function buildCategoryTree(
  rows: CategoryRow[],
  kind: CategoryKind,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): CategoryNode[] {
  const visible = (row: CategoryRow) => includeArchived || !row.archived;
  return rows
    .filter((row) => row.kind === kind && row.parentId === null && visible(row))
    .sort(byOrder)
    .map((parent) => ({
      ...parent,
      children: rows.filter((row) => row.parentId === parent.id && visible(row)).sort(byName),
    }));
}

// "Food › Groceries" for a sub-category, "Food" for a top-level one.
export function categoryPath(rows: CategoryRow[], id: string): string {
  const category = rows.find((row) => row.id === id);
  if (!category) return "";
  const parent = category.parentId ? rows.find((row) => row.id === category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

// The "Archived" section of the list: archived categories, plus the
// sub-categories of an archived parent (buildCategoryTree hides those too,
// so without this they could not be opened again). A to Z by full path.
export function archivedCategories(rows: CategoryRow[], kind: CategoryKind): { id: string; label: string }[] {
  const archivedIds = new Set(rows.filter((row) => row.archived).map((row) => row.id));
  return rows
    .filter((row) => row.kind === kind && (row.archived || (row.parentId !== null && archivedIds.has(row.parentId))))
    .map((row) => ({ id: row.id, label: categoryPath(rows, row.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// sort_order for a new top-level category: after the user's own ones. The
// system category (sort_order 1000) stays last.
export function nextSortOrder(rows: CategoryRow[], kind: CategoryKind): number {
  const orders = rows
    .filter((row) => row.kind === kind && row.parentId === null && row.systemKey === null)
    .map((row) => row.sortOrder);
  return (orders.length ? Math.max(...orders) : 0) + 10;
}

const FIELDS = ["name", "kind", "parentId"] as const;
type Field = (typeof FIELDS)[number];
export type CategoryFormErrors = Partial<Record<Field, string>>;
export type CategoryInput = { name: string; kind: CategoryKind; parentId: string | null };

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(40, "Use 40 characters or fewer."),
  kind: z.enum(CATEGORY_KINDS, { error: "Choose expense or income." }),
  // Empty means "top level".
  parentId: z.union([z.literal(""), z.uuid({ error: "Choose a category from the list." })]),
});

// One rule set for the category form: the browser and the Server Action
// both run it (the database checks again).
export function parseCategoryForm(
  raw: Record<string, unknown>,
): { ok: true; value: CategoryInput } | { ok: false; errors: CategoryFormErrors } {
  const text = Object.fromEntries(
    FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""]),
  );
  const result = categoryFormSchema.safeParse(text);
  if (!result.success) {
    const errors: CategoryFormErrors = {};
    for (const issue of result.error.issues) {
      errors[issue.path[0] as Field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { parentId, ...rest } = result.data;
  return { ok: true, value: { ...rest, parentId: parentId === "" ? null : parentId } };
}

// A database refusal on save, turned into a message for the right field.
// null: not about the form (for example no connection).
export function categorySaveError(code: string | undefined, message: string): CategoryFormErrors | null {
  if (code === "23505") return { name: "There is already a category with this name here." };
  if (code === "23503") return { parentId: "Choose a category from the list." };
  if (code === "23514") {
    if (message.includes("only two levels")) {
      return { parentId: "Choose a top-level category: sub-categories cannot have their own." };
    }
    if (message.includes("cannot become a sub-category")) {
      return { parentId: "This category has sub-categories, so it must stay at the top level." };
    }
    if (message.includes("same kind")) {
      return { parentId: "Choose a top-level category of the same kind." };
    }
  }
  return null;
}

// Why a category could not be deleted (D-32).
export function categoryDeleteError(code: string | undefined, message: string): string {
  if (code === "23514" && message.includes("system category")) {
    return "Fees & Charges is needed for transfer fees, so it cannot be deleted.";
  }
  if (isStillUsed(code)) {
    return "This category is in use (it has sub-categories, transactions or budgets). Archive it instead: it is hidden, and its history stays.";
  }
  return "Check your internet connection and try again.";
}

// "?kind=income" means income categories; anything else means expense.
export function kindFromParam(value: string | string[] | undefined): CategoryKind {
  return value === "income" ? "income" : "expense";
}

export type ParentChoice = { id: string; name: string; kind: CategoryKind };

// The categories that can hold sub-categories: top level and not archived.
// exceptId leaves out the category being edited. keepId keeps its current
// parent even if that parent is archived, so saving the form does not
// quietly move the category to the top level.
export function parentChoices(
  rows: CategoryRow[],
  { exceptId, keepId }: { exceptId?: string; keepId?: string | null } = {},
): ParentChoice[] {
  return rows
    .filter((row) => row.parentId === null && row.id !== exceptId && (!row.archived || row.id === keepId))
    .sort(byOrder)
    .map((row) => ({ id: row.id, name: row.name, kind: row.kind }));
}
