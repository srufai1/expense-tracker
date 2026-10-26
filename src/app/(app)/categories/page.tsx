import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ViewDetails } from "@/components/view-details";
import {
  archivedCategories,
  buildCategoryTree,
  CATEGORY_KINDS,
  kindFromParam,
  type CategoryKind,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

import { getCategories } from "./data";

export const metadata: Metadata = { title: "Categories" };

const KIND_LABEL: Record<CategoryKind, string> = { expense: "Expense", income: "Income" };

export default function CategoriesPage(props: PageProps<"/categories">) {
  return (
    <>
      <PageHeader title="Categories" backHref="/more" />
      {/* ?kind= comes from the address (request data), so everything that
          depends on it renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading categories…</p>}>
        <CategoriesView searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function CategoriesView({ searchParams }: { searchParams: PageProps<"/categories">["searchParams"] }) {
  const kind = kindFromParam((await searchParams).kind);
  const rows = await getCategories();
  const active = buildCategoryTree(rows, kind);
  const archived = archivedCategories(rows, kind);

  return (
    <>
      <nav aria-label="Category type" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {CATEGORY_KINDS.map((option) => (
          <Link
            key={option}
            href={`/categories?kind=${option}`}
            aria-current={option === kind ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg text-sm font-bold text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              option === kind && "bg-card text-foreground shadow-sm",
            )}
          >
            {KIND_LABEL[option]}
          </Link>
        ))}
      </nav>

      <Button asChild variant="outline" className="h-11 self-start">
        <Link href={`/categories/new?kind=${kind}`}>
          <Plus aria-hidden="true" />
          Add {kind} category
        </Link>
      </Button>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {kind} categories yet.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {active.map((parent) => (
            <li key={parent.id}>
              <CategoryLink id={parent.id} name={parent.name} system={parent.systemKey !== null} />
              {parent.children.length > 0 ? (
                <ul className="divide-y border-t" aria-label={`Inside ${parent.name}`}>
                  {parent.children.map((child) => (
                    <li key={child.id}>
                      <CategoryLink id={child.id} name={child.name} indent />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Archived</h2>
          <ViewDetails className="px-1">Hidden when you add a transaction. Old reports still show them.</ViewDetails>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {archived.map((category) => (
              <li key={category.id}>
                <CategoryLink id={category.id} name={category.label} muted />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function CategoryLink({
  id,
  name,
  system = false,
  indent = false,
  muted = false,
}: {
  id: string;
  name: string;
  system?: boolean;
  indent?: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={`/categories/${id}`}
      className={cn(
        "flex min-h-13 items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none",
        indent && "pl-10",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 break-words",
          indent ? "text-sm" : "font-bold",
          muted && "text-muted-foreground",
        )}
      >
        {name}
      </span>
      {system ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">System</span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
