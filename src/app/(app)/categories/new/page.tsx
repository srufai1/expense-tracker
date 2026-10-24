import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { kindFromParam, parentChoices } from "@/lib/categories";

import { createCategory } from "../actions";
import { CategoryForm } from "../category-form";
import { getCategories } from "../data";

export const metadata: Metadata = { title: "New category" };

export default function NewCategoryPage(props: PageProps<"/categories/new">) {
  return (
    <>
      <PageHeader title="New category" backHref="/categories" />
      {/* ?kind= and ?parent= come from the address (request data), so the
          form renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <NewCategory searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function NewCategory({ searchParams }: { searchParams: PageProps<"/categories/new">["searchParams"] }) {
  const params = await searchParams;
  const rows = await getCategories();
  const parents = parentChoices(rows);
  // "Add a sub-category" links pass ?parent=; use it only if it is a real choice.
  const parent = parents.find((choice) => choice.id === params.parent);
  const kind = parent ? parent.kind : kindFromParam(params.kind);

  return (
    <CategoryForm
      action={createCategory}
      submitLabel="Add category"
      initial={{ name: "", kind, parentId: parent?.id ?? "" }}
      parents={parents}
      kindLocked={false}
    />
  );
}
