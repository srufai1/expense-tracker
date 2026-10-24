import { describe, expect, it } from "vitest";

import { errorDialogOpen, errorList, firstInvalidField } from "./form-errors";

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

describe("errorDialogOpen", () => {
  const server = { from: "server" };
  const client = { from: "browser" };

  it("opens for a failed attempt that has not been dismissed", () => {
    expect(errorDialogOpen(server, [], 1)).toBe(true);
  });

  it("stays closed with no attempt, no messages, or once dismissed", () => {
    expect(errorDialogOpen(null, [], 1)).toBe(false);
    expect(errorDialogOpen(server, [], 0)).toBe(false);
    expect(errorDialogOpen(server, [server], 1)).toBe(false);
  });

  // Codex review on PR #4: server error dismissed, then a browser-side error
  // dismissed, then a correct save. While that save runs the form shows the
  // old server result again; it must not pop up a second time.
  it("does not reopen an older dismissed error after a newer one was dismissed", () => {
    expect(errorDialogOpen(server, [server, client], 1)).toBe(false);
  });
});
