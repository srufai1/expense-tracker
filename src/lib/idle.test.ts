import { describe, expect, it } from "vitest";

import { IDLE_LIMIT_MS, idleCheck } from "./idle";

const NOW = 1_800_000_000_000;

describe("idleCheck (D-49)", () => {
  it("is two hours", () => {
    expect(IDLE_LIMIT_MS).toBe(120 * 60 * 1000);
  });

  it("keeps a signed-in visitor who was active in the last two hours, and notes this visit", () => {
    expect(idleCheck({ signedIn: true, lastActive: String(NOW - 119 * 60_000), now: NOW })).toBe("touch");
    expect(idleCheck({ signedIn: true, lastActive: String(NOW), now: NOW })).toBe("touch");
  });

  it("signs out a visitor idle for two hours or more", () => {
    expect(idleCheck({ signedIn: true, lastActive: String(NOW - 120 * 60_000), now: NOW })).toBe("sign-out");
    expect(idleCheck({ signedIn: true, lastActive: String(NOW - 3 * 86_400_000), now: NOW })).toBe("sign-out");
  });

  it("signs out when the time is missing or not a number (sign-in always writes it)", () => {
    expect(idleCheck({ signedIn: true, lastActive: undefined, now: NOW })).toBe("sign-out");
    expect(idleCheck({ signedIn: true, lastActive: "yesterday", now: NOW })).toBe("sign-out");
  });

  it("does nothing for a signed-out visitor", () => {
    expect(idleCheck({ signedIn: false, lastActive: String(NOW - 99 * 60_000), now: NOW })).toBe("none");
    expect(idleCheck({ signedIn: false, lastActive: undefined, now: NOW })).toBe("none");
  });
});
