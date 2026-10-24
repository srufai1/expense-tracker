import type { TransactionFormErrors } from "@/lib/transactions";

// What a save attempt sends back to the form when it does not succeed.
// (On success the action redirects instead.)
export type TransactionFormState = {
  errors: TransactionFormErrors;
  // A problem not tied to one field, for example no connection.
  formError?: string;
  // What the user typed, so a failed save does not empty the form.
  values?: Record<string, string>;
};

export const initialTransactionFormState: TransactionFormState = { errors: {} };
