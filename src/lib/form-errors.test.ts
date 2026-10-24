import { describe, expect, it } from "vitest";

import { errorList, firstInvalidField } from "./form-errors";

const ORDER = ["name", "type", "amount"] as const;

describe("errorList", () => {
  it("lists field messages in the order the fields appear on screen", () => {
    expect(errorList({ amount: "Bad amount.", name: "Enter a name." }, ORDER)).toEqual([
      "Enter a name.",
      "Bad amount.",
    ]);
  });

  it("puts a problem that is not tied to a field first", () => {
    expect(errorList({ name: "Enter a name." }, ORDER, "No connection.")).toEqual([
      "No connection.",
      "Enter a name.",
    ]);
  });

  it("is empty when there is nothing wrong", () => {
    expect(errorList({}, ORDER)).toEqual([]);
    expect(errorList({}, ORDER, undefined)).toEqual([]);
  });
});

describe("firstInvalidField", () => {
  it("gives the first wrong field on screen", () => {
    expect(firstInvalidField({ amount: "x", type: "y" }, ORDER)).toBe("type");
  });

  it("gives null when no field is wrong", () => {
    expect(firstInvalidField({}, ORDER)).toBeNull();
  });
});
