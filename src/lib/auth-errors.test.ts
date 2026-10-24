import { describe, expect, it } from "vitest";

import { signInErrorField, signInErrorMessage } from "./auth-errors";

const WRONG = "That email and password do not match.";
const OFFLINE = "Could not reach the server. Check your internet connection and try again.";
const TOO_MANY = "Too many attempts. Wait a few minutes, then try again.";

describe("signInErrorMessage", () => {
  it("says the details are wrong when Supabase refuses them", () => {
    expect(signInErrorMessage(400)).toBe(WRONG);
    expect(signInErrorMessage(401)).toBe(WRONG);
    expect(signInErrorMessage(422)).toBe(WRONG);
  });

  it("asks the user to wait after too many attempts", () => {
    expect(signInErrorMessage(429)).toBe(TOO_MANY);
  });

  it("blames the connection when there is no answer or a server error", () => {
    expect(signInErrorMessage(undefined)).toBe(OFFLINE);
    expect(signInErrorMessage(0)).toBe(OFFLINE);
    expect(signInErrorMessage(500)).toBe(OFFLINE);
    expect(signInErrorMessage(503)).toBe(OFFLINE);
  });
});

describe("signInErrorField", () => {
  it("points at the password when Supabase refuses the details", () => {
    expect(signInErrorField(400)).toBe("password");
    expect(signInErrorField(422)).toBe("password");
  });

  it("points at no field for too many attempts or a connection problem", () => {
    expect(signInErrorField(429)).toBeUndefined();
    expect(signInErrorField(undefined)).toBeUndefined();
    expect(signInErrorField(0)).toBeUndefined();
    expect(signInErrorField(503)).toBeUndefined();
  });
});
