import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/auth";
import { budgetFor } from "@/lib/budgets";
import { categoryPath } from "@/lib/categories";
import { formatMonth, todayInAccra } from "@/lib/dates";
import { formatAmountForInput, formatMoney } from "@/lib/money";

import { getCategories } from "../../categories/data";
import { saveBudget } from "../actions";
import { BudgetForm } from "../budget-form";
import { getBudgetRows } from "../data";

export const metadata: Metadata = { title: "Budget" };

export default function BudgetPage(props: PageProps<"/budgets/[categoryId]">) {
  return (
    <>
      <PageHeader title="Budget" backHref="/budgets" />
      {/* The category comes from the address (request data), so the form
          renders inside a Suspense boundary (Cache Components rule). */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <Budget params={props.params} />
      </Suspense>
    </>
  );
}

async function Budget({ params }: { params: PageProps<"/budgets/[categoryId]">["params"] }) {
  const { categoryId } = await params;
  await requireUser();
  const [categories, rows] = await Promise.all([getCategories(), getBudgetRows()]);
  const category = categories.find((c) => c.id === categoryId && c.kind === "expense");
  if (!category) notFound();

  const month = todayInAccra().slice(0, 7);
  const history = rows.filter((row) => row.categoryId === category.id).reverse();
  const children = categories.filter((c) => c.parentId === category.id && !c.archived);
  const parent = categories.find((c) => c.id === category.parentId);

  return (
    <>
      <h2 className="text-lg font-bold">{categoryPath(categories, category.id)}</h2>
      {parent ? (
        <p className="text-sm text-muted-foreground">
          A sub-category budget is part of {parent.name}&apos;s budget: together, the sub-category budgets may not
          be more than it.
        </p>
      ) : null}

      <BudgetForm
        action={saveBudget.bind(null, category.id)}
        initial={{ amount: formatAmountForInput(budgetFor(rows, category.id, month)), month }}
      />

      {history.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Changes">
          <h3 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Changes</h3>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {history.map((row) => (
              <li key={row.effectiveFrom} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                <span>From {formatMonth(row.effectiveFrom.slice(0, 7))}</span>
                <span className="font-semibold tabular-nums">
                  {row.amountMinor === 0 ? "No budget" : formatMoney(row.amountMinor, "GHS")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {children.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Sub-category budgets">
          <h3 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            Sub-category budgets (optional)
          </h3>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/budgets/${child.id}`}
                  className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="flex-1">{child.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {budgetFor(rows, child.id, month) ? formatMoney(budgetFor(rows, child.id, month), "GHS") : "—"}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
