// The letter in the round profile button when there is no photo: the first
// letter of the sign-in email's name part (before @), as a capital. "?"
// when that part has no letter.
export function profileInitial(email: string | null): string {
  const letter = email?.split("@")[0].match(/\p{L}/u)?.[0];
  return letter ? letter.toUpperCase() : "?";
}
