import { describe, expect, it } from "vitest";

import { profileInitial } from "./profile";

describe("profileInitial", () => {
  it("shows the first letter of the email as a capital, when there is no photo", () => {
    expect(profileInitial("srufai100@gmail.com")).toBe("S");
    expect(profileInitial("ama@example.com")).toBe("A");
  });

  it("skips signs and digits to find a letter, and falls back to a person sign", () => {
    expect(profileInitial("_99kofi@example.com")).toBe("K");
    expect(profileInitial("123@example.com")).toBe("?");
    expect(profileInitial(null)).toBe("?");
  });
});
