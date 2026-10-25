import { describe, expect, it } from "vitest";

import { lockoutMessage } from "./lockout";

const NOW = new Date("2026-10-25T10:00:00Z");

describe("lockoutMessage (D-49)", () => {
  it("says how many whole minutes are left, rounding up", () => {
    expect(lockoutMessage("2026-10-25T10:20:00Z", NOW)).toBe("Too many failed attempts. Try again in 20 minutes.");
    expect(lockoutMessage("2026-10-25T10:05:30Z", NOW)).toBe("Too many failed attempts. Try again in 6 minutes.");
    expect(lockoutMessage("2026-10-25T10:00:20Z", NOW)).toBe("Too many failed attempts. Try again in 1 minute.");
  });

  it("never says 0 minutes", () => {
    expect(lockoutMessage("2026-10-25T09:59:00Z", NOW)).toBe("Too many failed attempts. Try again in 1 minute.");
  });
});
