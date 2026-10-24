import { describe, expect, it } from "vitest";

import { isIsoDate, todayInAccra } from "./dates";

describe("todayInAccra", () => {
  it("gives the date in Accra as YYYY-MM-DD", () => {
    expect(todayInAccra(new Date("2026-10-23T09:30:00Z"))).toBe("2026-10-23");
  });

  it("uses Accra time (UTC+0), not the computer's time zone", () => {
    expect(todayInAccra(new Date("2026-10-23T23:59:59Z"))).toBe("2026-10-23");
    expect(todayInAccra(new Date("2026-10-24T00:00:00Z"))).toBe("2026-10-24");
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-10-23")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true); // leap year
  });

  it("rejects dates that do not exist or are badly written", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("23/10/2026")).toBe(false);
    expect(isIsoDate("2026-10-23T00:00")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});
