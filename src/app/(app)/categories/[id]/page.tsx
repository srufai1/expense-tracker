import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ArchiveDeleteZone } from "@/components/archive-delete-zone";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import { categoryNoun, editCategoryTitle, parentChoices, subCategoryDeleteNote } from "@/lib/categories";

import { deleteCategory, deleteSubCategory, setCategoryArchived, updateCategory } from "../actions";
import { CategoryForm } from "../category-form";
import { getCategories } from "../data";

export const metadata: Metadata = { title: "Edit category" };

export default function EditCategoryPage(props: PageProps<"/categories/[id]">) {
  return (
    <>
      {/* The category id comes from the address (request data), so the page
          renders inside a Suspense boundary (Cache Components rule). The
          title is inside too: it says "sub-category" for a sub-category. */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <EditCategory params={props.params} />
      </Suspense>
    </>
  );
}

async function EditCategory({ params }: { params: PageProps<"/categories/[id]">["params"] }) {
  const { id } = await params;
  const rows = await getCategories();
  const category = rows.find((row) => row.id === id);
  if (!category) notFound();

  const isSystem = category.systemKey !== null;
  const parent = category.parentId ? rows.find((row) => row.id === category.parentId) : undefined;
  const hasChildren = rows.some((row) => row.parentId === category.id);
  const parentLockedReason = isSystem
    ? "Fees & Charges always stays a top-level category."
    : hasChildren
      ? "This category has sub-categories, so it stays at the top level."
      : undefined;

  return (
    <>
      <PageHeader title={editCategoryTitle(category)} backHref="/categories" />
      <CategoryForm
        action={updateCategory.bind(null, category.id)}
        submitLabel="Save changes"
        initial={{ name: category.name, kind: category.kind, parentId: category.parentId ?? "" }}
        parents={parentChoices(rows, { exceptId: category.id, keepId: category.parentId })}
        kindLocked
        parentLockedReason={parentLockedReason}
      />

      {category.parentId === null && !category.archived ? (
        <Button asChild variant="outline" size="lg" className="h-12 text-base">
          <Link href={`/categories/new?parent=${category.id}`}>
            <Plus aria-hidden="true" />
            Add a sub-category
          </Link>
        </Button>
      ) : null}

      {isSystem ? (
        <ViewDetails className="border-t pt-5">
          Transfer fees are saved here, so this category cannot be archived or deleted. You can rename it.
        </ViewDetails>
      ) : (
        <ArchiveDeleteZone
          thing={categoryNoun(category)}
          name={category.name}
          archived={category.archived}
          onArchive={setCategoryArchived.bind(null, category.id)}
          onDelete={parent ? deleteSubCategory.bind(null, category.id) : deleteCategory.bind(null, category.id)}
          deleteDescription={parent ? subCategoryDeleteNote(parent.name) : undefined}
          archiveHint={`Hides the ${categoryNoun(category)} when you add a transaction. Its history stays in reports.`}
          unarchiveHint={`Shows the ${categoryNoun(category)} when you add a transaction again.`}
        />
      )}
    </>
  );
}
