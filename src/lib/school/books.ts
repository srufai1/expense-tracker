// Past questions books (D-56): which of a student's books can be given out
// now. A book needs a copy in stock, and the student's money not yet used
// by books already given out must cover it (books are taken in order).

export type WaitingBook = { id: string; subjectId: string; priceMinor: number };

export function givableBooks(
  books: WaitingBook[],
  { stock, paidMinor, givenMinor }: { stock: Map<string, number>; paidMinor: number; givenMinor: number },
): Map<string, "ok" | "none left" | "not paid for yet"> {
  const result = new Map<string, "ok" | "none left" | "not paid for yet">();
  const left = new Map(stock);
  let credit = paidMinor - givenMinor;
  for (const book of books) {
    const inStock = left.get(book.subjectId) ?? 0;
    if (inStock < 1) {
      result.set(book.id, "none left");
    } else if (credit < book.priceMinor) {
      result.set(book.id, "not paid for yet");
    } else {
      credit -= book.priceMinor;
      left.set(book.subjectId, inStock - 1);
      result.set(book.id, "ok");
    }
  }
  return result;
}
