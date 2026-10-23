import { describe, expect, it } from "vitest";

import { isSupabaseAuthCookie } from "./auth-cookies";

describe("isSupabaseAuthCookie", () => {
  it("matches the session cookie and its chunks", () => {
    expect(isSupabaseAuthCookie("sb-rptlxvoevrqzcvvmccgr-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-rptlxvoevrqzcvvmccgr-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-rptlxvoevrqzcvvmccgr-auth-token.1")).toBe(true);
  });

  it("leaves other cookies alone", () => {
    expect(isSupabaseAuthCookie("theme")).toBe(false);
    expect(isSupabaseAuthCookie("sb-something-else")).toBe(false);
    expect(isSupabaseAuthCookie("my-auth-token")).toBe(false);
  });
});
