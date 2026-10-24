// Supabase returns at most 1,000 rows per request (the project's "max rows"
// setting) and gives no error when there are more: the rest are simply
// missing. Any read that can pass 1,000 rows goes through this, page by
// page. The query must have a fixed order, so pages do not overlap.

export const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    // A short page is the last one. A full page may have more after it.
    if (page.length < PAGE_SIZE) return rows;
  }
}
