import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("next/server", { spy: true });
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "test-user" }) }));
vi.mock("../../(app)/school/data", () => ({
  getFee: async () => ({
    name: "Exam fee",
    students: [{
      name: "Test Student", className: "JHS 1", payableMinor: 50000, paidMinor: 25000,
      payments: [{ amountMinor: 25000, paidOn: "2026-11-16", note: "Advance" }],
    }],
    handovers: [],
  }),
  getMorningWeek: async () => ({
    days: [{ date: "2026-11-16", noClass: false, full: [27, 0, 0], lessMinor: [200, 0, 0], feeMinor: 300, schoolMinor: 50 }],
    week: null,
  }),
}));

describe("school report PDFs", () => {
  it.each([
    ["fee=11111111-1111-4111-8111-111111111111", "fee-payment-statement.pdf"],
    ["week=2026-11-16", "morning-classes-2026-11-16.pdf"],
  ])("renders a printable PDF for %s", async (query, filename) => {
    const next = await import("next/server");
    vi.mocked(next.connection).mockResolvedValue(undefined);
    const response = await GET(new NextRequest(`http://localhost/api/school-report.pdf?${query}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(`inline; filename="${filename}"`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.text()).startsWith("%PDF-")).toBe(true);
  });
});
