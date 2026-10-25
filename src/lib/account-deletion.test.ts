import { describe, expect, it } from "vitest";

import { deleteConfirmed, DELETE_WORD } from "./account-deletion";

describe("Delete my account (D-51)", () => {
  it("needs the word DELETE typed exactly (spaces around it are ignored)", () => {
    expect(DELETE_WORD).toBe("DELETE");
    expect(deleteConfirmed("DELETE")).toBe(true);
    expect(deleteConfirmed("  DELETE ")).toBe(true);
    expect(deleteConfirmed("delete")).toBe(false);
    expect(deleteConfirmed("DELETE!")).toBe(false);
    expect(deleteConfirmed("")).toBe(false);
    expect(deleteConfirmed(null)).toBe(false);
  });
});
