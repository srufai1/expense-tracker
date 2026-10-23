import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a path inside the app", () => {
    expect(safeRedirectPath("/reports")).toBe("/reports");
    expect(safeRedirectPath("/reports?period=week")).toBe("/reports?period=week");
  });

  it("falls back when there is no value", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects other websites", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("evil.example")).toBe("/");
  });

  it("does not loop back to the sign-in page", () => {
    expect(safeRedirectPath("/sign-in")).toBe("/");
    expect(safeRedirectPath("/sign-in?next=/reports")).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/activity")).toBe("/activity");
  });
});
