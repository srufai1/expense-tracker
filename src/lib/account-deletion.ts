// "Delete my account" (D-51) asks the user to type this word first.
export const DELETE_WORD = "DELETE";

export function deleteConfirmed(typed: FormDataEntryValue | string | null): boolean {
  return typeof typed === "string" && typed.trim() === DELETE_WORD;
}
