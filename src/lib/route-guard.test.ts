import { describe, expect, it } from "vitest";

import { getRedirect, isPublicPath } from "./route-guard";

describe("isPublicPath", () => {
  it("treats the sign-in page as public", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-in/anything")).toBe(true);
  });

  it("treats every app page as private", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/reports")).toBe(false);
    expect(isPublicPath("/more")).toBe(false);
  });

  it("does not match paths that only start with the same letters", () => {
    expect(isPublicPath("/sign-instead")).toBe(false);
  });
});

describe("getRedirect when signed out", () => {
  const signedIn = false;

  it("sends Home to sign-in without a next value", () => {
    expect(getRedirect({ pathname: "/", search: "", signedIn })).toBe("/sign-in");
  });

  it("sends other pages to sign-in and remembers the page", () => {
    expect(getRedirect({ pathname: "/reports", search: "", signedIn })).toBe(
      "/sign-in?next=%2Freports",
    );
  });

  it("keeps the query string of the page", () => {
    expect(getRedirect({ pathname: "/more", search: "?x=1", signedIn })).toBe(
      "/sign-in?next=%2Fmore%3Fx%3D1",
    );
  });

  it("lets the sign-in page load", () => {
    expect(getRedirect({ pathname: "/sign-in", search: "?next=%2Freports", signedIn })).toBeNull();
  });
});

describe("getRedirect when signed in", () => {
  const signedIn = true;

  it("lets app pages load", () => {
    expect(getRedirect({ pathname: "/", search: "", signedIn })).toBeNull();
    expect(getRedirect({ pathname: "/reports", search: "", signedIn })).toBeNull();
  });

  it("sends the sign-in page to Home", () => {
    expect(getRedirect({ pathname: "/sign-in", search: "", signedIn })).toBe("/");
  });
});
