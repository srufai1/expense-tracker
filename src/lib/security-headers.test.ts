import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "./security-headers";

const header = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe("SECURITY_HEADERS", () => {
  it("stops other sites from showing the app inside a frame (clickjacking)", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("stops type guessing, trims the referrer and keeps HTTPS on", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });

  it("turns off the microphone and location, which the app never uses (the camera stays allowed for receipts)", () => {
    expect(header("Permissions-Policy")).toBe("microphone=(), geolocation=()");
  });
});
