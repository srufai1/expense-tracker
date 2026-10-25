import { describe, expect, it } from "vitest";

import { clientAddress } from "./request";

describe("clientAddress", () => {
  it("reads the visitor's address the way Vercel passes it (the first one listed)", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("says unknown when there is none, and never returns more than 64 characters", () => {
    expect(clientAddress(new Headers())).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": "x".repeat(100) }))).toHaveLength(64);
  });
});
