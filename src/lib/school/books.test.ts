import { describe, expect, it } from "vitest";

import { givableBooks } from "./books";

const MATHS = "maths";
const ENGLISH = "english";

describe("givableBooks", () => {
  it("a paid-up student gets every book in stock", () => {
    const result = givableBooks(
      [
        { id: "a", subjectId: MATHS, priceMinor: 8000 },
        { id: "b", subjectId: ENGLISH, priceMinor: 8000 },
      ],
      { stock: new Map([[MATHS, 10], [ENGLISH, 12]]), paidMinor: 16000, givenMinor: 0 },
    );
    expect([...result]).toEqual([
      ["a", "ok"],
      ["b", "ok"],
    ]);
  });

  it("money already used by given books does not count twice", () => {
    // Paid 160, Maths (80) already given: only one more book is covered.
    const result = givableBooks(
      [
        { id: "b", subjectId: ENGLISH, priceMinor: 8000 },
        { id: "c", subjectId: MATHS, priceMinor: 8000 },
      ],
      { stock: new Map([[MATHS, 3], [ENGLISH, 3]]), paidMinor: 16000, givenMinor: 8000 },
    );
    expect(result.get("b")).toBe("ok");
    expect(result.get("c")).toBe("not paid for yet");
  });

  it("no copy left in stock", () => {
    const result = givableBooks([{ id: "a", subjectId: MATHS, priceMinor: 8000 }], {
      stock: new Map([[MATHS, 0]]),
      paidMinor: 8000,
      givenMinor: 0,
    });
    expect(result.get("a")).toBe("none left");
    const unknown = givableBooks([{ id: "a", subjectId: "science", priceMinor: 8000 }], { stock: new Map(), paidMinor: 8000, givenMinor: 0 });
    expect(unknown.get("a")).toBe("none left");
  });
});
