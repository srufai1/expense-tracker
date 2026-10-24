import { describe, expect, it } from "vitest";

import {
  archivedCategories,
  buildCategoryTree,
  categoryDeleteError,
  categoryPath,
  categorySaveError,
  kindFromParam,
  nextSortOrder,
  parentChoices,
  parseCategoryForm,
  type CategoryRow,
} from "./categories";

const row = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  kind: "expense",
  parentId: null,
  systemKey: null,
  sortOrder: 0,
  archived: false,
  ...values,
});

const ROWS: CategoryRow[] = [
  row({ id: "food", name: "Food", sortOrder: 10 }),
  row({ id: "groc", name: "Groceries", parentId: "food" }),
  row({ id: "eat", name: "Eating out", parentId: "food" }),
  row({ id: "old", name: "Old snacks", parentId: "food", archived: true }),
  row({ id: "fees", name: "Fees & Charges", systemKey: "fees", sortOrder: 1000 }),
  row({ id: "tr", name: "Transport", sortOrder: 20 }),
  row({ id: "gone", name: "Gone", sortOrder: 30, archived: true }),
  row({ id: "gone-child", name: "Gone child", parentId: "gone" }),
  row({ id: "sal", name: "Salary", kind: "income", sortOrder: 10 }),
];

describe("buildCategoryTree", () => {
  it("gives top-level categories in their order, each with sub-categories A to Z", () => {
    const tree = buildCategoryTree(ROWS, "expense");
    expect(tree.map((node) => node.name)).toEqual(["Food", "Transport", "Fees & Charges"]);
    expect(tree[0].children.map((child) => child.name)).toEqual(["Eating out", "Groceries"]);
  });

  it("leaves out archived categories, and the sub-categories of an archived one", () => {
    const names = buildCategoryTree(ROWS, "expense").flatMap((node) => [
      node.name,
      ...node.children.map((child) => child.name),
    ]);
    expect(names).not.toContain("Old snacks");
    expect(names).not.toContain("Gone");
    expect(names).not.toContain("Gone child");
  });

  it("can include archived categories", () => {
    const tree = buildCategoryTree(ROWS, "expense", { includeArchived: true });
    expect(tree.map((node) => node.name)).toContain("Gone");
    expect(tree[0].children.map((child) => child.name)).toContain("Old snacks");
  });

  it("keeps income and expense apart", () => {
    expect(buildCategoryTree(ROWS, "income").map((node) => node.name)).toEqual(["Salary"]);
  });
});

describe("categoryPath", () => {
  it("names a sub-category with its parent", () => {
    expect(categoryPath(ROWS, "groc")).toBe("Food › Groceries");
    expect(categoryPath(ROWS, "food")).toBe("Food");
    expect(categoryPath(ROWS, "missing")).toBe("");
  });
});

describe("nextSortOrder", () => {
  it("places a new top-level category after the others but before Fees & Charges", () => {
    expect(nextSortOrder(ROWS, "expense")).toBe(40);
    expect(nextSortOrder(ROWS, "income")).toBe(20);
    expect(nextSortOrder([], "income")).toBe(10);
  });
});

describe("parseCategoryForm", () => {
  const PARENT = "11111111-1111-4111-8111-111111111111";

  it("reads a top-level and a sub-category", () => {
    expect(parseCategoryForm({ name: " Snacks ", kind: "expense", parentId: "" })).toEqual({
      ok: true,
      value: { name: "Snacks", kind: "expense", parentId: null },
    });
    expect(parseCategoryForm({ name: "Snacks", kind: "expense", parentId: PARENT })).toEqual({
      ok: true,
      value: { name: "Snacks", kind: "expense", parentId: PARENT },
    });
  });

  it("explains each problem", () => {
    expect(parseCategoryForm({ name: "", kind: "other", parentId: "not-an-id" })).toEqual({
      ok: false,
      errors: {
        name: "Enter a name.",
        kind: "Choose expense or income.",
        parentId: "Choose a category from the list.",
      },
    });
    const long = parseCategoryForm({ name: "x".repeat(41), kind: "expense", parentId: "" });
    expect(long.ok ? null : long.errors.name).toBe("Use 40 characters or fewer.");
    expect(parseCategoryForm({}).ok).toBe(false);
  });
});

describe("categorySaveError", () => {
  it("turns database refusals into form messages", () => {
    expect(categorySaveError("23505", "")).toEqual({
      name: "There is already a category with this name here.",
    });
    expect(categorySaveError("23514", "categories: only two levels are allowed")).toEqual({
      parentId: "Choose a top-level category: sub-categories cannot have their own.",
    });
    expect(categorySaveError("23514", "categories: a category with sub-categories cannot become a sub-category")).toEqual({
      parentId: "This category has sub-categories, so it must stay at the top level.",
    });
    expect(categorySaveError("23514", "categories: a sub-category must have the same kind as its parent")).toEqual({
      parentId: "Choose a top-level category of the same kind.",
    });
    expect(categorySaveError("23503", "categories: parent category not found")).toEqual({
      parentId: "Choose a category from the list.",
    });
  });

  it("returns null for problems that are not about the form", () => {
    expect(categorySaveError(undefined, "fetch failed")).toBeNull();
    expect(categorySaveError("23514", "something else")).toBeNull();
  });
});

describe("categoryDeleteError", () => {
  it("explains why a category cannot be deleted (D-32)", () => {
    expect(categoryDeleteError("23514", "categories: Fees & Charges is a system category and cannot be deleted")).toBe(
      "Fees & Charges is needed for transfer fees, so it cannot be deleted.",
    );
    expect(categoryDeleteError("23503", "violates RESTRICT setting of foreign key constraint")).toBe(
      "This category is in use (it has sub-categories, transactions or budgets). Archive it instead: it is hidden, and its history stays.",
    );
    // Postgres 18 reports ON DELETE RESTRICT with its own code.
    expect(categoryDeleteError("23001", "violates RESTRICT setting of foreign key constraint")).toBe(
      "This category is in use (it has sub-categories, transactions or budgets). Archive it instead: it is hidden, and its history stays.",
    );
    expect(categoryDeleteError(undefined, "fetch failed")).toBe(
      "Check your internet connection and try again.",
    );
  });
});

describe("kindFromParam", () => {
  it("reads income, and treats anything else as expense", () => {
    expect(kindFromParam("income")).toBe("income");
    expect(kindFromParam("expense")).toBe("expense");
    expect(kindFromParam(undefined)).toBe("expense");
    expect(kindFromParam("transfer")).toBe("expense");
    expect(kindFromParam(["income", "expense"])).toBe("expense");
  });
});

describe("parentChoices", () => {
  it("lists active top-level categories of both kinds, in order", () => {
    expect(parentChoices(ROWS).map((choice) => choice.id)).toEqual(["food", "sal", "tr", "fees"]);
    expect(parentChoices(ROWS)[0]).toEqual({ id: "food", name: "Food", kind: "expense" });
  });

  it("leaves out the category being edited", () => {
    expect(parentChoices(ROWS, { exceptId: "food" }).map((choice) => choice.id)).toEqual(["sal", "tr", "fees"]);
  });

  it("keeps the current parent even when it is archived", () => {
    expect(parentChoices(ROWS, { keepId: "gone" }).map((choice) => choice.id)).toContain("gone");
    expect(parentChoices(ROWS, { keepId: null }).map((choice) => choice.id)).not.toContain("gone");
  });
});

describe("archivedCategories", () => {
  it("lists archived ones and the sub-categories of an archived parent, with their path", () => {
    expect(archivedCategories(ROWS, "expense")).toEqual([
      { id: "old", label: "Food › Old snacks" },
      { id: "gone", label: "Gone" },
      { id: "gone-child", label: "Gone › Gone child" },
    ]);
    expect(archivedCategories(ROWS, "income")).toEqual([]);
  });
});
