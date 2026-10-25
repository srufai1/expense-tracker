import { describe, expect, it } from "vitest";

import { inviteCodeMatches, isSignUpOpen, parseSignUpForm, signUpErrorMessage } from "./sign-up";

const CODE = "a-long-invite-code-16+";

describe("isSignUpOpen (D-45)", () => {
  it("is open only when SIGNUP_INVITE_CODE is set and at least 16 characters", () => {
    expect(isSignUpOpen(CODE)).toBe(true);
    expect(isSignUpOpen(undefined)).toBe(false);
    expect(isSignUpOpen("")).toBe(false);
    expect(isSignUpOpen("short-code-15ch")).toBe(false);
  });
});

describe("inviteCodeMatches", () => {
  it("accepts the exact code, ignoring spaces typed around it", () => {
    expect(inviteCodeMatches(CODE, CODE)).toBe(true);
    expect(inviteCodeMatches(`  ${CODE} `, CODE)).toBe(true);
  });

  it("refuses a wrong code, and everything while sign-up is closed", () => {
    expect(inviteCodeMatches(`${CODE}x`, CODE)).toBe(false);
    expect(inviteCodeMatches(CODE.slice(0, -1), CODE)).toBe(false);
    expect(inviteCodeMatches("", CODE)).toBe(false);
    expect(inviteCodeMatches("short", "short")).toBe(false);
    expect(inviteCodeMatches("anything", undefined)).toBe(false);
  });
});

describe("parseSignUpForm", () => {
  const good = { email: " Ama@Example.com ", password: "correct horse", confirm: "correct horse", inviteCode: CODE };

  it("accepts a valid form and tidies the email", () => {
    expect(parseSignUpForm(good)).toEqual({
      ok: true,
      data: { email: "ama@example.com", password: "correct horse", inviteCode: CODE },
    });
  });

  it("names the first wrong field, so the pop-up can point to it (D-31)", () => {
    expect(parseSignUpForm({ ...good, email: "not-an-email" })).toEqual({
      ok: false,
      field: "email",
      error: "Enter a valid email address.",
    });
    expect(parseSignUpForm({ ...good, password: "short", confirm: "short" })).toEqual({
      ok: false,
      field: "password",
      error: "Use a password of at least 8 characters.",
    });
    expect(parseSignUpForm({ ...good, confirm: "something else" })).toEqual({
      ok: false,
      field: "confirm",
      error: "The two passwords are not the same.",
    });
    expect(parseSignUpForm({ ...good, inviteCode: "" })).toEqual({
      ok: false,
      field: "inviteCode",
      error: "Enter the invite code you were given.",
    });
  });

  it("refuses values longer than the database or Supabase allow", () => {
    expect(parseSignUpForm({ ...good, email: `${"a".repeat(250)}@x.com` })).toMatchObject({ field: "email" });
    const long = "p".repeat(73);
    expect(parseSignUpForm({ ...good, password: long, confirm: long })).toEqual({
      ok: false,
      field: "password",
      error: "Use a password of at most 72 characters.",
    });
  });
});

describe("signUpErrorMessage", () => {
  it("explains the refusals Supabase gives when creating a user", () => {
    expect(signUpErrorMessage("email_exists", 422)).toBe(
      "An account with this email already exists. Sign in instead.",
    );
    expect(signUpErrorMessage("weak_password", 422)).toBe(
      "Supabase refused this password as too weak. Choose a longer one.",
    );
    expect(signUpErrorMessage(undefined, undefined)).toBe(
      "Could not reach the server. Check your internet connection and try again.",
    );
    expect(signUpErrorMessage("validation_failed", 400)).toBe(
      "Could not create the account. Check the details and try again.",
    );
    expect(signUpErrorMessage("unexpected_failure", 500)).toBe(
      "Could not reach the server. Check your internet connection and try again.",
    );
  });
});
