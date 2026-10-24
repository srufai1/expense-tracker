import { describe, expect, it } from "vitest";

import { isStillUsed } from "./db-errors";

describe("isStillUsed", () => {
  it("is true when other rows still point at the row being deleted", () => {
    expect(isStillUsed("23503")).toBe(true); // foreign key violation (Postgres 17 and older)
    expect(isStillUsed("23001")).toBe(true); // ON DELETE RESTRICT (Postgres 18)
  });

  it("is false for anything else", () => {
    expect(isStillUsed("23514")).toBe(false);
    expect(isStillUsed(undefined)).toBe(false);
  });
});
