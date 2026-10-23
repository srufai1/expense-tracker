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

  it("rejects addresses a browser would turn into another website", () => {
    // ?next=/%09/evil.example arrives here as "/\t/evil.example".
    expect(safeRedirectPath("/\t/evil.example")).toBe("/");
    expect(safeRedirectPath("/\n/evil.example")).toBe("/");
    expect(safeRedirectPath("/\r\n/evil.example")).toBe("/");
    expect(safeRedirectPath("/\\/evil.example")).toBe("/");
  });

  it("keeps an encoded character as part of a path inside the app", () => {
    expect(safeRedirectPath("/%09/evil.example")).toBe("/%09/evil.example");
  });

  it("does not loop back to the sign-in page", () => {
    expect(safeRedirectPath("/sign-in")).toBe("/");
    expect(safeRedirectPath("/sign-in?next=/reports")).toBe("/");
    expect(safeRedirectPath("/sign-in/")).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/activity")).toBe("/activity");
  });
});
