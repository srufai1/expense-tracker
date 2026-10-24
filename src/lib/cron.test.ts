import { describe, expect, it } from "vitest";

import { isCronAuthorized } from "./cron";

const SECRET = "a-long-random-secret-of-at-least-32-chars";

describe("isCronAuthorized", () => {
  it("accepts the header Vercel Cron sends: Bearer <CRON_SECRET>", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a missing or wrong header", () => {
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized("", SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
  });

  it("refuses everything when CRON_SECRET is not set, or too short to be safe", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
