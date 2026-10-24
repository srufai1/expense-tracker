import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ArchiveDeleteZone } from "@/components/archive-delete-zone";
import { Button } from "@/components/ui/button";
import { parentChoices } from "@/lib/categories";

import { deleteCategory, setCategoryArchived, updateCategory } from "../actions";
import { CategoryForm } from "../category-form";
import { getCategories } from "../data";

export const metadata: Metadata = { title: "Edit category" };

export default function EditCategoryPage(props: PageProps<"/categories/[id]">) {
  return (
    <>
      <PageHeader title="Edit category" backHref="/categories" />
      {/* The category id comes from the address (request data), so the form
          renders inside a Suspense boundary (Cache Components rule). */}
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
  const hasChildren = rows.some((row) => row.parentId === category.id);
  const parentLockedReason = isSystem
    ? "Fees & Charges always stays a top-level category."
    : hasChildren
      ? "This category has sub-categories, so it stays at the top level."
      : undefined;

  return (
    <>
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
        <p className="border-t pt-5 text-sm text-muted-foreground">
          Transfer fees are saved here, so this category cannot be archived or deleted. You can rename it.
        </p>
      ) : (
        <ArchiveDeleteZone
          thing="category"
          name={category.name}
          archived={category.archived}
          onArchive={setCategoryArchived.bind(null, category.id)}
          onDelete={deleteCategory.bind(null, category.id)}
          archiveHint="Hides the category when you add a transaction. Its history stays in reports."
          unarchiveHint="Shows the category when you add a transaction again."
        />
      )}
    </>
  );
}
