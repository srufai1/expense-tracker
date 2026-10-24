import ExcelJS from "exceljs";

import { appConfig } from "@/config/app";

import type { Sheet } from "./sheets";

// Writes sheets (from sheets.ts) as an .xlsx file. Kept thin: what goes
// into the cells is decided and tested in sheets.ts.
export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = appConfig.name;
  for (const sheet of sheets) {
    const hasHeader = sheet.columns.some((column) => column.header !== "");
    const page = book.addWorksheet(sheet.name, hasHeader ? { views: [{ state: "frozen", ySplit: 1 }] } : {});
    page.columns = sheet.columns.map((column) => ({
      // Without a header, exceljs would still write an empty first row.
      header: hasHeader ? column.header : undefined,
      width: column.width,
      style: column.format === "money" ? { numFmt: "#,##0.00" } : {},
    }));
    if (hasHeader) page.getRow(1).font = { bold: true };
    page.addRows(sheet.rows);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
