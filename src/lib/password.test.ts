import { describe, expect, it } from "vitest";

import { parseNewPassword, passwordUpdateError, resetLinkMessage } from "./password";

describe("parseNewPassword (D-48)", () => {
  it("accepts 8 to 72 characters typed the same twice", () => {
    expect(parseNewPassword({ password: "new password 1", confirm: "new password 1" })).toEqual({
      ok: true,
      password: "new password 1",
    });
  });

  it("names the wrong field, for the pop-up (D-31)", () => {
    expect(parseNewPassword({ password: "short", confirm: "short" })).toEqual({
      ok: false,
      field: "password",
      error: "Use a password of at least 8 characters.",
    });
    const long = "p".repeat(73);
    expect(parseNewPassword({ password: long, confirm: long })).toEqual({
      ok: false,
      field: "password",
      error: "Use a password of at most 72 characters.",
    });
    expect(parseNewPassword({ password: "new password 1", confirm: "new password 2" })).toEqual({
      ok: false,
      field: "confirm",
      error: "The two passwords are not the same.",
    });
  });
});

describe("passwordUpdateError", () => {
  it("explains why Supabase refused the new password", () => {
    expect(passwordUpdateError("same_password", 422)).toBe(
      "The new password must be different from the old one.",
    );
    expect(passwordUpdateError("weak_password", 422)).toBe(
      "Supabase refused this password as too weak. Choose a longer one.",
    );
    expect(passwordUpdateError("session_not_found", 403)).toBe(
      "Your sign-in has expired. Ask for a new reset link and try again.",
    );
    expect(passwordUpdateError(undefined, undefined)).toBe(
      "Could not reach the server. Check your internet connection and try again.",
    );
    expect(passwordUpdateError("validation_failed", 400)).toBe("Could not change the password. Try again.");
  });
});

describe("resetLinkMessage", () => {
  it("never says whether the email has an account", () => {
    expect(resetLinkMessage(undefined)).toEqual({
      ok: true,
      message: "If an account uses this email, a reset link is on its way. Check your inbox and spam folder.",
    });
    // A refusal for an unknown email looks the same as success.
    expect(resetLinkMessage(400)).toEqual(resetLinkMessage(undefined));
  });

  it("asks to wait when too many emails were asked for, and reports a lost connection", () => {
    expect(resetLinkMessage(429)).toEqual({
      ok: false,
      message: "Too many reset emails were asked for. Wait an hour, then try again.",
    });
    expect(resetLinkMessage(0)).toEqual({
      ok: false,
      message: "Could not reach the server. Check your internet connection and try again.",
    });
    expect(resetLinkMessage(503)).toEqual(resetLinkMessage(0));
  });
});
