import type { CategoryFormErrors } from "@/lib/categories";

// What a save attempt sends back to the form when it does not succeed.
export type CategoryFormState = {
  errors: CategoryFormErrors;
  formError?: string;
  values?: Record<string, string>;
};

export const initialCategoryFormState: CategoryFormState = { errors: {} };
