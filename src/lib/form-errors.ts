// Helpers for the form error pop-up (D-31).

// The messages to show, in the order the fields appear on screen. A problem
// not tied to one field (for example no connection) comes first.
export function errorList<F extends string>(
  errors: Partial<Record<F, string>>,
  fieldOrder: readonly F[],
  formError?: string,
): string[] {
  const fieldMessages = fieldOrder.flatMap((field) => (errors[field] ? [errors[field]] : []));
  return formError ? [formError, ...fieldMessages] : fieldMessages;
}

// The first wrong field on screen: the pop-up moves there when it closes.
export function firstInvalidField<F extends string>(
  errors: Partial<Record<F, string>>,
  fieldOrder: readonly F[],
): F | null {
  return fieldOrder.find((field) => errors[field]) ?? null;
}
