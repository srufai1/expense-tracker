import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { schoolSheets, type SchoolBackup } from "./school-sheets";
import { everythingSheets } from "./sheets";
import { toXlsx } from "./workbook";

// School money in "Export everything" (D-57).

const day = (date: string, full: [number, number, number], less: [number, number, number] = [0, 0, 0]) => ({
  date,
  noClass: false,
  reason: null,
  note: "",
  full,
  lessMinor: less,
  feeMinor: 300,
  schoolMinor: 50,
});

const DATA: SchoolBackup = {
  accountName: "Cash",
  heldMinor: 123456,
  days: [
    day("2026-10-22", [13, 12, 12], [0, 400, 0]),
    { ...day("2026-10-23", [0, 0, 0]), noClass: true, reason: "holiday", note: "Farmers' Day" },
    day("2026-10-21", [14, 14, 14]),
  ],
  weeks: [
    {
      weekStart: "2026-10-19",
      settledOn: "2026-10-23",
      classDays: 5,
      collectedMinor: 59800,
      schoolMinor: 9900,
      savingsMinor: 9500,
      markersMinor: 2500,
      assistantMinor: 4000,
      eachMinor: 8475,
      shares: [
        { name: "Me", isMe: true, amountMinor: 8475, paidOn: "2026-10-23" },
        { name: "Mr Mensah", isMe: false, amountMinor: 8475, paidOn: "2026-10-24" },
        { name: "Mrs Owusu", isMe: false, amountMinor: 8475, paidOn: null },
      ],
    },
  ],
  fundSpends: [
    { fund: "morning", spentOn: "2026-10-24", amountMinor: 6000, purpose: "sports", note: "Sports day" },
    { fund: "books", spentOn: "2026-10-25", amountMinor: 500, purpose: "teacher_books", note: "" },
  ],
  fees: [
    {
      name: "Mock 1 fees",
      amountMinor: 15000,
      archived: false,
      students: [
        { name: "Ama", className: "JHS 3", payableMinor: 15000, payments: [{ paidOn: "2026-10-20", amountMinor: 15000, note: "" }] },
        {
          name: "Kofi",
          className: "JHS 3",
          payableMinor: 15000,
          payments: [
            { paidOn: "2026-10-22", amountMinor: 5000, note: "second" },
            { paidOn: "2026-10-20", amountMinor: 5000, note: "first" },
          ],
        },
        { name: "Yaw", className: "JHS 3", payableMinor: 15000, payments: [] },
        { name: "Efua", className: "JHS 3", payableMinor: 0, payments: [] },
        { name: "Kwame", className: "JHS 3", payableMinor: 15000, payments: [{ paidOn: "2026-10-21", amountMinor: 16000, note: "" }] },
      ],
      handovers: [
        { toWhom: "myself", handedOn: "2026-10-24", amountMinor: 3000, note: "" },
        { toWhom: "headmaster", handedOn: "2026-10-23", amountMinor: 20000, note: "Signed" },
      ],
    },
  ],
  subjects: [{ name: "Mathematics", priceMinor: 8000 }],
  purchases: [{ subject: "Mathematics", boughtOn: "2026-10-21", quantity: 20, amountMinor: 90000, note: "" }],
  bookStudents: [
    {
      name: "Ama",
      className: "JHS 3",
      orders: [
        { subject: "Mathematics", priceMinor: 8000, givenOn: "2026-10-26", split: { costMinor: 4500, transportMinor: 500, mineMinor: 2000, teachersMinor: 1000 } },
        { subject: "English", priceMinor: 8000, givenOn: null, split: null },
      ],
      payments: [{ paidOn: "2026-10-20", amountMinor: 16000, note: "" }],
    },
  ],
};

const sheet = (name: string) => {
  const found = schoolSheets(DATA).find((s) => s.name === name);
  if (!found) throw new Error(`no sheet ${name}`);
  return found;
};

describe("schoolSheets", () => {
  it("has one sheet per kind of record, each name short enough for Excel", () => {
    const names = schoolSheets(DATA).map((s) => s.name);
    expect(names).toEqual([
      "School money",
      "Morning days",
      "Morning weeks",
      "Morning shares",
      "Fund spending",
      "Fee students",
      "Fee payments",
      "Hand-overs",
      "Books bought",
      "Book orders",
      "Book payments",
      "Book subjects",
    ]);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31);
  });

  it("the summary: what is held, both funds, and each fee", () => {
    expect(sheet("School money").rows).toEqual([
      ["Kept in", "Cash"],
      ["Holding for the school (GHS)", 1234.56],
      ["Morning classes savings (GHS)", 35],
      ["Teachers' book fund (GHS)", 5],
      // 150 + 50 + 50 + 160 paid − 200 − 30 handed over.
      ["Mock 1 fees: holding (GHS)", 180],
    ]);
  });

  it("morning days in date order, with the totals worked out as on the screen", () => {
    const rows = sheet("Morning days").rows;
    expect(rows.map((r) => r[0])).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(rows[1]).toEqual(["2026-10-22", "Yes", 13, 0, 12, 4, 12, 0, 115, 18.5, "", ""]);
    expect(rows[2]).toEqual(["2026-10-23", "No", 0, 0, 0, 0, 0, 0, 0, 0, "Holiday", "Farmers' Day"]);
  });

  it("settled weeks and each share", () => {
    expect(sheet("Morning weeks").rows).toEqual([["2026-10-19", "2026-10-23", 5, 598, 99, 95, 25, 40, 84.75, 3]]);
    expect(sheet("Morning shares").rows).toEqual([
      ["2026-10-19", "Me", 84.75, "My income"],
      ["2026-10-19", "Mr Mensah", 84.75, "2026-10-24"],
      ["2026-10-19", "Mrs Owusu", 84.75, "Not paid yet"],
    ]);
  });

  it("fund spending names the fund and what it was for", () => {
    expect(sheet("Fund spending").rows).toEqual([
      ["Morning classes savings", "2026-10-24", 60, "Sports", "Sports day"],
      ["Teachers' book fund", "2026-10-25", 5, "Books for teachers", ""],
    ]);
  });

  it("fee students with status and balance, payments by date, hand-overs", () => {
    expect(sheet("Fee students").rows).toEqual([
      ["Mock 1 fees", "Ama", "JHS 3", 150, 150, 0, "Paid"],
      ["Mock 1 fees", "Kofi", "JHS 3", 150, 100, 50, "Advance"],
      ["Mock 1 fees", "Yaw", "JHS 3", 150, 0, 150, "Not paid"],
      ["Mock 1 fees", "Efua", "JHS 3", 0, 0, 0, "Full discount"],
      ["Mock 1 fees", "Kwame", "JHS 3", 150, 160, 0, "Paid (extra)"],
    ]);
    expect(sheet("Fee payments").rows.map((r) => [r[1], r[2], r[4]])).toEqual([
      ["Ama", "2026-10-20", ""],
      ["Kofi", "2026-10-20", "first"],
      ["Kwame", "2026-10-21", ""],
      ["Kofi", "2026-10-22", "second"],
    ]);
    expect(sheet("Hand-overs").rows).toEqual([
      ["Mock 1 fees", "Headmaster", "2026-10-23", 200, "Signed"],
      ["Mock 1 fees", "Myself", "2026-10-24", 30, ""],
    ]);
  });

  it("books: bought, orders with their split, payments, subjects", () => {
    expect(sheet("Books bought").rows).toEqual([["Mathematics", "2026-10-21", 20, 900, ""]]);
    expect(sheet("Book orders").rows).toEqual([
      ["Ama", "JHS 3", "Mathematics", 80, "2026-10-26", 45, 5, 10, 20],
      ["Ama", "JHS 3", "English", 80, "Not yet", null, null, null, null],
    ]);
    expect(sheet("Book payments").rows).toEqual([["Ama", "JHS 3", "2026-10-20", 160, ""]]);
    expect(sheet("Book subjects").rows).toEqual([["Mathematics", 80]]);
  });
});

describe("Export everything", () => {
  const base = { accounts: [], categories: [], transactions: [], budgets: [], goals: [], recurring: [] };

  it("adds the School money sheets after the others when School money is set up", () => {
    const names = everythingSheets({ ...base, school: DATA }).map((s) => s.name);
    expect(names.slice(0, 7)).toEqual(["Accounts", "Categories", "Transactions", "Budgets", "Goals", "Goal contributions", "Recurring"]);
    expect(names.slice(7)).toEqual(schoolSheets(DATA).map((s) => s.name));
  });

  it("has no School money sheets when it is not set up", () => {
    expect(everythingSheets({ ...base, school: null })).toHaveLength(7);
    expect(everythingSheets(base)).toHaveLength(7);
  });
});

describe("the School money sheets in a real .xlsx file", () => {
  it("Excel can open them: every sheet, with its rows", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await toXlsx(schoolSheets(DATA))) as unknown as ArrayBuffer);
    expect(book.worksheets.map((s) => s.name)).toEqual(schoolSheets(DATA).map((s) => s.name));
    expect(book.getWorksheet("School money")!.getCell("B2").value).toBe(1234.56);
    expect(book.getWorksheet("Morning weeks")!.getCell("I2").value).toBe(84.75);
  });
});
