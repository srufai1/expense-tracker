// The text a user typed into a form, as plain strings. Next.js adds its own
// fields (named "$ACTION_…"), and files are not text: both are left out.
// Used to send typed values back when a save fails, so the form keeps them.
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  });
  return values;
}
