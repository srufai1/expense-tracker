import { describe, expect, it } from "vitest";

import {
  parseBookSplitForm,
  parseFeeForm,
  parseFundSpendForm,
  parseHandoverForm,
  parseMorningDayForm,
  parseMyPartForm,
  parseNoClassForm,
  parsePayableForm,
  parsePaymentForm,
  parsePurchaseForm,
  parseSettleForm,
  parseSharerForm,
  parseStudentsForm,
  parseSubjectForm,
} from "./forms";

const TODAY = "2026-10-26"; // a Monday
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("parseMorningDayForm", () => {
  it("reads the full payers and the money from those who paid less, per class", () => {
    expect(
      parseMorningDayForm({ date: "2026-10-22", full1: "13", less1: "", full2: "12", less2: "4.00", full3: "12", less3: "0" }, TODAY),
    ).toEqual({ ok: true, value: { date: "2026-10-22", full: [13, 12, 12], lessMinor: [0, 400, 0] } });
  });

  it("treats empty boxes as 0", () => {
    const result = parseMorningDayForm({ date: "2026-10-22" }, TODAY);
    expect(result).toEqual({ ok: true, value: { date: "2026-10-22", full: [0, 0, 0], lessMinor: [0, 0, 0] } });
  });

  it("refuses weekends, future days, bad counts and bad amounts", () => {
    expect(parseMorningDayForm({ date: "2026-10-24" }, TODAY)).toEqual({
      ok: false,
      errors: { date: "Morning classes are Monday to Friday." },
    });
    expect(parseMorningDayForm({ date: "2026-10-27" }, TODAY)).toEqual({
      ok: false,
      errors: { date: "The date cannot be in the future." },
    });
    expect(parseMorningDayForm({ date: "2026-10-22", full1: "2.5", less2: "abc" }, TODAY)).toEqual({
      ok: false,
      errors: { full1: "Enter a number of students, 0 to 500.", less2: "Enter an amount, for example 12.50." },
    });
    expect(parseMorningDayForm({ date: "2026-10-22", full3: "501" }, TODAY)).toMatchObject({ ok: false });
  });
});

describe("parseNoClassForm", () => {
  it("reads a reason and a note; a holiday may be marked ahead", () => {
    expect(parseNoClassForm({ date: "2026-10-30", reason: "holiday", note: " Farmers' Day " })).toEqual({
      ok: true,
      value: { date: "2026-10-30", reason: "holiday", note: "Farmers' Day" },
    });
  });

  it("needs a known reason on a weekday", () => {
    expect(parseNoClassForm({ date: "2026-10-25", reason: "party", note: "" })).toEqual({
      ok: false,
      errors: { date: "Morning classes are Monday to Friday.", reason: "Choose a reason." },
    });
  });
});

describe("parseSettleForm", () => {
  it("reads the deductions and the people who share", () => {
    expect(parseSettleForm({ settledOn: "2026-10-23", markers: "25", assistant: "40.00" }, [ID, ID2, ID], TODAY)).toEqual({
      ok: true,
      value: { settledOn: "2026-10-23", markersMinor: 2500, assistantMinor: 4000, sharerIds: [ID, ID2] },
    });
  });

  it("allows no markers (an empty box is 0)", () => {
    const result = parseSettleForm({ settledOn: "2026-10-23", markers: "", assistant: "25" }, [ID], TODAY);
    expect(result).toMatchObject({ ok: true, value: { markersMinor: 0, assistantMinor: 2500 } });
  });

  it("needs at least one sharer, and keeps the other errors", () => {
    expect(parseSettleForm({ settledOn: "2026-10-23", markers: "25", assistant: "40" }, ["nope"], TODAY)).toEqual({
      ok: false,
      errors: { sharers: "Choose at least one person to share." },
    });
    expect(parseSettleForm({ settledOn: "", markers: "-1", assistant: "40" }, [], TODAY)).toEqual({
      ok: false,
      errors: {
        settledOn: "Enter a real date.",
        markers: "The amount cannot be negative.",
        sharers: "Choose at least one person to share.",
      },
    });
    expect(parseSettleForm({ settledOn: "", markers: "25", assistant: "40" }, [ID], TODAY)).toMatchObject({ ok: false });
  });
});

describe("parseSharerForm", () => {
  it("needs a name of 40 characters or fewer", () => {
    expect(parseSharerForm({ name: " Mr Mensah " })).toEqual({ ok: true, value: { name: "Mr Mensah" } });
    expect(parseSharerForm({ name: "" })).toEqual({ ok: false, errors: { name: "Enter a name." } });
  });
});

describe("parseFundSpendForm", () => {
  it("reads an amount, a date and what it was for", () => {
    expect(parseFundSpendForm({ amount: "60", spentOn: "2026-10-16", purpose: "sports", note: "Sports day" }, TODAY)).toEqual({
      ok: true,
      value: { amountMinor: 6000, spentOn: "2026-10-16", purpose: "sports", note: "Sports day" },
    });
    expect(parseFundSpendForm({ amount: "0", spentOn: "2026-10-16", purpose: "x", note: "" }, TODAY)).toEqual({
      ok: false,
      errors: { amount: "The amount must be more than 0.", purpose: "Choose what it was for." },
    });
  });
});

describe("parseFeeForm", () => {
  it("reads a name and the usual amount (0 allowed)", () => {
    expect(parseFeeForm({ name: "Mock 1 fees", amount: "150" })).toEqual({ ok: true, value: { name: "Mock 1 fees", amountMinor: 15000 } });
    expect(parseFeeForm({ name: "Free trip", amount: "" })).toEqual({ ok: true, value: { name: "Free trip", amountMinor: 0 } });
    expect(parseFeeForm({ name: "", amount: "x" })).toEqual({
      ok: false,
      errors: { name: "Enter a name, e.g. Mock 1 fees.", amount: "Enter an amount, for example 12.50." },
    });
  });
});

describe("parseStudentsForm", () => {
  it("reads one name per line, without blanks or repeats", () => {
    expect(parseStudentsForm({ names: "Ama Owusu\n\n  Kofi   Asante \r\nAma Owusu\n", className: "JHS 3" })).toEqual({
      ok: true,
      value: { names: ["Ama Owusu", "Kofi Asante"], className: "JHS 3" },
    });
  });

  it("needs a name, and limits the list and each name", () => {
    expect(parseStudentsForm({ names: " \n ", className: "" })).toEqual({
      ok: false,
      errors: { names: "Enter at least one name, one per line." },
    });
    expect(parseStudentsForm({ names: "x".repeat(81), className: "" })).toMatchObject({ ok: false });
    const many = Array.from({ length: 201 }, (_, i) => `Student ${i}`).join("\n");
    expect(parseStudentsForm({ names: many, className: "" })).toEqual({
      ok: false,
      errors: { names: "Add at most 200 names at a time." },
    });
  });
});

describe("parsePaymentForm", () => {
  it("a payment from a student on the list", () => {
    expect(parsePaymentForm({ studentId: ID, newName: "", newClass: "", amount: "100", paidOn: TODAY, note: "" }, TODAY)).toEqual({
      ok: true,
      value: { student: { id: ID }, amountMinor: 10000, paidOn: TODAY, note: "" },
    });
  });

  it("a payment from a new student", () => {
    expect(
      parsePaymentForm({ studentId: "new", newName: " Yaw  Boateng ", newClass: "JHS 3", amount: "50", paidOn: TODAY, note: "" }, TODAY),
    ).toEqual({ ok: true, value: { student: { name: "Yaw Boateng", className: "JHS 3" }, amountMinor: 5000, paidOn: TODAY, note: "" } });
  });

  it("needs a student, a name for a new one, and an amount (0 only when allowed)", () => {
    expect(parsePaymentForm({ studentId: "", amount: "10", paidOn: TODAY }, TODAY)).toEqual({
      ok: false,
      errors: { studentId: "Choose a student." },
    });
    expect(parsePaymentForm({ studentId: "new", newName: "", amount: "10", paidOn: TODAY }, TODAY)).toEqual({
      ok: false,
      errors: { newName: "Enter the student's name." },
    });
    expect(parsePaymentForm({ studentId: ID, amount: "", paidOn: TODAY }, TODAY)).toMatchObject({ ok: false });
    expect(parsePaymentForm({ studentId: ID, amount: "", paidOn: TODAY }, TODAY, { allowZero: true })).toMatchObject({
      ok: true,
      value: { amountMinor: 0 },
    });
  });
});

describe("parsePayableForm", () => {
  it("allows 0, a full discount", () => {
    expect(parsePayableForm({ payable: "0" })).toEqual({ ok: true, value: { payableMinor: 0 } });
    expect(parsePayableForm({ payable: "120.50" })).toEqual({ ok: true, value: { payableMinor: 12050 } });
    expect(parsePayableForm({ payable: "-1" })).toMatchObject({ ok: false });
  });
});

describe("parseHandoverForm", () => {
  it("reads who received it, how much and when", () => {
    expect(parseHandoverForm({ toWhom: "headmaster", amount: "1,450", handedOn: TODAY, note: "" }, TODAY)).toEqual({
      ok: true,
      value: { toWhom: "headmaster", amountMinor: 145000, handedOn: TODAY, note: "" },
    });
    expect(parseHandoverForm({ toWhom: "nobody", amount: "1", handedOn: TODAY }, TODAY)).toEqual({
      ok: false,
      errors: { toWhom: "Choose who received it." },
    });
  });
});

describe("parseMyPartForm", () => {
  it("reads the amount you kept", () => {
    expect(parseMyPartForm({ amount: "30", receivedOn: TODAY, note: "Mock 1" }, TODAY)).toEqual({
      ok: true,
      value: { amountMinor: 3000, receivedOn: TODAY, note: "Mock 1" },
    });
    expect(parseMyPartForm({ amount: "30", receivedOn: "2026-11-01", note: "" }, TODAY)).toEqual({
      ok: false,
      errors: { receivedOn: "The date cannot be in the future." },
    });
  });
});

describe("book forms", () => {
  it("a subject with its price", () => {
    expect(parseSubjectForm({ name: "Mathematics", price: "80" })).toEqual({ ok: true, value: { name: "Mathematics", priceMinor: 8000 } });
    expect(parseSubjectForm({ name: "", price: "0" })).toEqual({
      ok: false,
      errors: { name: "Enter a subject.", price: "The amount must be more than 0." },
    });
  });

  it("transport and your part per book (0 allowed)", () => {
    expect(parseBookSplitForm({ transport: "5", mine: "20" })).toEqual({ ok: true, value: { transportMinor: 500, mineMinor: 2000 } });
    expect(parseBookSplitForm({ transport: "", mine: "-2" })).toMatchObject({ ok: false });
  });

  it("books bought: subject, how many, what you paid", () => {
    expect(parsePurchaseForm({ subjectId: ID, quantity: "20", amount: "900", boughtOn: TODAY, note: "" }, TODAY)).toEqual({
      ok: true,
      value: { subjectId: ID, quantity: 20, amountMinor: 90000, boughtOn: TODAY, note: "" },
    });
    expect(parsePurchaseForm({ subjectId: "", quantity: "0", amount: "900", boughtOn: TODAY }, TODAY)).toEqual({
      ok: false,
      errors: { subjectId: "Choose a subject.", quantity: "Enter how many, 1 to 10,000." },
    });
  });
});
