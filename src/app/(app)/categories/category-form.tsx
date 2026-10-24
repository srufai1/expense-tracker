"use client";

import { useActionState, useState, type FormEvent } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_KINDS, parseCategoryForm, type CategoryFormErrors, type CategoryKind } from "@/lib/categories";
import { errorList, firstInvalidField } from "@/lib/form-errors";

import { initialCategoryFormState, type CategoryFormState } from "./form-state";

const FIELD_ORDER = ["name", "kind", "parentId"] as const;
const FOCUS = { name: "#name", kind: 'input[name="kind"]', parentId: "#parentId" } as const;
const KIND_LABEL: Record<CategoryKind, string> = { expense: "Expense", income: "Income" };

type Values = { name: string; kind: CategoryKind; parentId: string };

export function CategoryForm({
  action,
  initial,
  parents,
  kindLocked,
  parentLockedReason,
  submitLabel,
}: {
  action: (state: CategoryFormState, formData: FormData) => Promise<CategoryFormState>;
  initial: Values;
  // Top-level categories that can be a parent (not archived, not itself).
  parents: { id: string; name: string; kind: CategoryKind }[];
  // The kind is fixed once a category exists.
  kindLocked: boolean;
  // Why the parent cannot change (system category, or it has sub-categories).
  parentLockedReason?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialCategoryFormState);
  const [clientAttempt, setClientAttempt] = useState<{ errors: CategoryFormErrors } | null>(null);

  const values = { ...initial, ...state.values } as Values;
  const [kind, setKind] = useState<CategoryKind>(values.kind);
  const serverFailed = Boolean(state.formError) || Object.keys(state.errors).length > 0;
  const attempt = clientAttempt ?? (serverFailed ? state : null);
  const errors: CategoryFormErrors = attempt?.errors ?? {};
  const formError = clientAttempt ? undefined : state.formError;
  const firstWrong = firstInvalidField(errors, FIELD_ORDER);

  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const result = parseCategoryForm(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.ok) {
      event.preventDefault();
      setClientAttempt({ errors: result.errors });
    } else {
      setClientAttempt(null);
    }
  }

  return (
    <form action={formAction} onSubmit={checkBeforeSending} noValidate className="flex flex-col gap-5">
      <FormErrorDialog
        attempt={attempt}
        title={Object.keys(errors).length > 0 ? "Please check the form" : "Could not save"}
        messages={errorList(errors, FIELD_ORDER, formError)}
        focusSelector={firstWrong ? FOCUS[firstWrong] : null}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={values.name}
          placeholder="e.g. Snacks"
          maxLength={40}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          className="h-12 text-base"
        />
        <ScreenReaderError id="name-error" message={errors.name} />
      </div>

      {kindLocked ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Used for</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {CATEGORY_KINDS.map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-bold text-muted-foreground has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {KIND_LABEL[option]}
              </label>
            ))}
          </div>
          <ScreenReaderError id="kind-error" message={errors.kind} />
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        {parentLockedReason ? (
          <>
            {/* No <select> to point at, so a plain heading instead of a <Label>. */}
            <span className="text-sm font-medium">Inside</span>
            <input type="hidden" name="parentId" value={values.parentId} />
            <p className="text-sm text-muted-foreground">{parentLockedReason}</p>
          </>
        ) : (
          <>
            <Label htmlFor="parentId">Inside</Label>
            {/* key: a new list of choices when the kind changes */}
            <NativeSelect
              key={kind}
              id="parentId"
              name="parentId"
              defaultValue={values.kind === kind ? values.parentId : ""}
              aria-invalid={Boolean(errors.parentId)}
              aria-describedby={`parentId-hint${errors.parentId ? " parentId-error" : ""}`}
            >
              <option value="">Nothing — a top-level category</option>
              {parents
                .filter((parent) => parent.kind === kind)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </NativeSelect>
            <p id="parentId-hint" className="text-xs text-muted-foreground">
              Choose a category to make this a sub-category of it, e.g. Food › Snacks.
            </p>
            <ScreenReaderError id="parentId-error" message={errors.parentId} />
          </>
        )}
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// Sighted users see the message in the pop-up; screen readers read it here.
function ScreenReaderError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="sr-only">
      {message}
    </p>
  );
}
