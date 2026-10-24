import { describe, expect, it, vi } from "vitest";

import { fetchDailyRate, parseErApiResponse, pickRate, RATE_SERVICE_URL, rateHint, sameRate } from "./fx";

const RATES = [
  { rateDate: "2026-10-20", rate: "11.6" },
  { rateDate: "2026-10-22", rate: "11.65" },
  { rateDate: "2026-10-24", rate: "11.671489" },
];

describe("pickRate (M-5)", () => {
  it("uses the rate stored for that date", () => {
    expect(pickRate(RATES, "2026-10-22")).toEqual({ rateDate: "2026-10-22", rate: "11.65" });
  });

  it("otherwise uses the latest earlier rate", () => {
    expect(pickRate(RATES, "2026-10-23")).toEqual({ rateDate: "2026-10-22", rate: "11.65" });
    expect(pickRate(RATES, "2027-01-01")).toEqual({ rateDate: "2026-10-24", rate: "11.671489" });
  });

  it("has no rate before the first stored one, or with none stored (M-6)", () => {
    expect(pickRate(RATES, "2026-10-19")).toBeNull();
    expect(pickRate([], "2026-10-24")).toBeNull();
  });

  it("does not depend on the order of the list", () => {
    expect(pickRate([...RATES].reverse(), "2026-10-23")).toEqual({ rateDate: "2026-10-22", rate: "11.65" });
  });
});

describe("rateHint", () => {
  it("names the rate's date, and warns when it is older than the transaction", () => {
    expect(rateHint({ rateDate: "2026-10-24", rate: "11.671489" }, "2026-10-24")).toBe("Rate for 24 Oct 2026.");
    expect(rateHint({ rateDate: "2026-10-22", rate: "11.65" }, "2026-10-24")).toBe(
      "Rate from 22 Oct 2026, the latest stored before this date.",
    );
  });

  it("asks for a rate when none is stored (M-6)", () => {
    expect(rateHint(null, "2026-10-24")).toBe("No exchange rate is stored for this date. Type the rate you got.");
  });
});

describe("sameRate", () => {
  it("compares rates as numbers, not text", () => {
    expect(sameRate("11.65", "11.650000")).toBe(true);
    expect(sameRate("011.65", "11.65")).toBe(true);
    expect(sameRate(11.65, "11.65")).toBe(true);
    expect(sameRate("11.65", "11.651")).toBe(false);
  });

  it("is false for anything that is not a valid rate", () => {
    expect(sameRate("abc", "abc")).toBe(false);
    expect(sameRate("", "11")).toBe(false);
  });
});

describe("parseErApiResponse (D-35)", () => {
  const reply = {
    result: "success",
    base_code: "USD",
    time_last_update_unix: 1792800151, // Sat, 24 Oct 2026 00:02:31 UTC
    rates: { USD: 1, GHS: 11.671489, EUR: 0.86 },
  };

  it("reads the GHS rate and the provider's update date", () => {
    expect(parseErApiResponse(reply)).toEqual({ ok: true, rateDate: "2026-10-24", rate: "11.671489" });
  });

  it("keeps at most 6 decimals", () => {
    expect(parseErApiResponse({ ...reply, rates: { GHS: 11.6714894 } })).toEqual({
      ok: true,
      rateDate: "2026-10-24",
      rate: "11.671489",
    });
  });

  it("refuses a reply that is not a usable USD→GHS rate", () => {
    expect(parseErApiResponse(null)).toEqual({ ok: false, error: "The rate service sent an unexpected reply." });
    expect(parseErApiResponse({ ...reply, result: "error" }).ok).toBe(false);
    expect(parseErApiResponse({ ...reply, base_code: "EUR" }).ok).toBe(false);
    expect(parseErApiResponse({ ...reply, rates: { EUR: 1 } }).ok).toBe(false);
    expect(parseErApiResponse({ ...reply, rates: { GHS: 0 } }).ok).toBe(false);
    expect(parseErApiResponse({ ...reply, rates: { GHS: "11" } }).ok).toBe(false);
    expect(parseErApiResponse({ ...reply, time_last_update_unix: "x" }).ok).toBe(false);
    // Positive, but 0.000000 once rounded to 6 decimals; or too big for the column.
    expect(parseErApiResponse({ ...reply, rates: { GHS: 0.0000001 } })).toEqual({
      ok: false,
      error: "The rate service sent an unusable rate.",
    });
    expect(parseErApiResponse({ ...reply, rates: { GHS: 123456789 } }).ok).toBe(false);
  });
});

describe("fetchDailyRate", () => {
  const reply = { result: "success", base_code: "USD", time_last_update_unix: 1792800151, rates: { GHS: 11.671489 } };

  it("asks open.er-api.com for USD rates and reads the GHS rate", async () => {
    const fetchFn = vi.fn(async () => Response.json(reply));
    expect(await fetchDailyRate(fetchFn as unknown as typeof fetch)).toEqual({
      ok: true,
      rateDate: "2026-10-24",
      rate: "11.671489",
    });
    expect(fetchFn).toHaveBeenCalledWith(RATE_SERVICE_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("reports a failure instead of throwing (M-6)", async () => {
    const down = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
    expect(await fetchDailyRate(down)).toEqual({ ok: false, error: "The rate service answered 503." });

    const offline = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    expect(await fetchDailyRate(offline)).toEqual({
      ok: false,
      error: "The rate service could not be reached: getaddrinfo ENOTFOUND",
    });

    const notJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect((await fetchDailyRate(notJson)).ok).toBe(false);
  });
});
