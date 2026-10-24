import { describe, expect, it } from "vitest";

import { fetchAllPages } from "./pages";

// A fake table of `total` rows that answers like Supabase's .range(from, to):
// at most `cap` rows per request, whatever the range asks for.
function fakeTable(total: number, cap = 1000) {
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1, total - 1);
    return { data: Array.from({ length: Math.max(0, end - from + 1) }, (_, i) => from + i), error: null };
  };
  return { fetchPage, calls };
}

describe("fetchAllPages", () => {
  it("reads every row, page by page, past the 1,000-row cap", async () => {
    const table = fakeTable(2_345);
    const rows = await fetchAllPages(table.fetchPage);
    expect(rows).toHaveLength(2_345);
    expect(rows[2_344]).toBe(2_344);
    expect(table.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one request for a short table, and asks once more after exactly a full page", async () => {
    const short = fakeTable(3);
    expect(await fetchAllPages(short.fetchPage)).toEqual([0, 1, 2]);
    expect(short.calls).toHaveLength(1);
    const exact = fakeTable(1_000);
    expect(await fetchAllPages(exact.fetchPage)).toHaveLength(1_000);
    expect(exact.calls).toHaveLength(2);
  });

  it("returns nothing for an empty table, and throws the database error", async () => {
    expect(await fetchAllPages(fakeTable(0).fetchPage)).toEqual([]);
    await expect(fetchAllPages(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
    // No rows and no error (data null) counts as an empty last page.
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual([]);
  });
});
