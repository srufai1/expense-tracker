import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { toXlsx } from "./workbook";

describe("toXlsx", () => {
  it("writes a real .xlsx file: a sheet per Sheet, bold headers, money as numbers with 2 decimals", async () => {
    const buffer = await toXlsx([
      {
        name: "Transactions",
        columns: [
          { header: "Date", width: 12 },
          { header: "Amount", width: 14, format: "money" },
          { header: "Note", width: 20 },
        ],
        rows: [
          ["2026-10-20", 25, "Waakye"],
          ["2026-10-21", 1234.5, null],
        ],
      },
      { name: "Summary", columns: [{ header: "", width: 30 }, { header: "", width: 20 }], rows: [["Spent (GHS)", 143.21]] },
    ]);
    // An .xlsx file is a zip file: it starts with "PK".
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Transactions", "Summary"]);

    const transactions = book.getWorksheet("Transactions")!;
    expect(transactions.getRow(1).values).toEqual([undefined, "Date", "Amount", "Note"]);
    expect(transactions.getRow(1).font?.bold).toBe(true);
    expect(transactions.getCell("B3").value).toBe(1234.5);
    expect(transactions.getCell("B3").numFmt).toBe("#,##0.00");
    expect(transactions.getCell("C3").value).toBeNull();
    expect(transactions.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    // A sheet without headers has no header row.
    const summary = book.getWorksheet("Summary")!;
    expect(summary.getCell("A1").value).toBe("Spent (GHS)");
    expect(summary.getCell("B1").value).toBe(143.21);
  });
});
