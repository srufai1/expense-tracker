import "server-only";

import { requireUser } from "@/lib/auth";
import type { SchoolBackup } from "@/lib/export/school-sheets";
import { fetchAllPages } from "@/lib/pages";
import { formatDate } from "@/lib/dates";
import type { MorningDay } from "@/lib/school/morning";
import type { Fund, FundPurpose, NoClassReason, Recipient } from "@/lib/school/fees";
import { createClient } from "@/lib/supabase/server";

// School money data (D-54 – D-56). Row-Level Security limits every query to
// the signed-in user's rows.

type Client = Awaited<ReturnType<typeof createClient>>;

async function client(): Promise<Client> {
  await requireUser();
  return createClient();
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Could not load ${what}: ${error.message}`);
}

// 22P02: an id in the address is not a valid uuid — "not found".
function notFoundOrFail(what: string, error: { code?: string; message: string } | null) {
  if (error && error.code !== "22P02") fail(what, error);
}

export type SchoolSettings = {
  accountId: string;
  accountName: string;
  incomeCategoryId: string;
  bookTransportMinor: number;
  bookMineMinor: number;
};

export async function getSchoolSettings(): Promise<SchoolSettings | null> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("school_settings")
    .select("account_id, income_category_id, book_transport_minor, book_mine_minor")
    .maybeSingle();
  if (error) fail("the School money settings", error);
  if (!data) return null;
  const { data: account, error: accountError } = await supabase.from("accounts").select("name").eq("id", data.account_id).single();
  if (accountError) fail("the School money account", accountError);
  return {
    accountId: data.account_id,
    accountName: account.name,
    incomeCategoryId: data.income_category_id,
    bookTransportMinor: data.book_transport_minor,
    bookMineMinor: data.book_mine_minor,
  };
}

// The accounts school money can be kept in: active GHS accounts, cash first.
export async function getGhsAccounts(): Promise<{ id: string; name: string }[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("currency", "GHS")
    .is("archived_at", null)
    .order("created_at");
  if (error) fail("accounts", error);
  return [...data].sort((a, b) => Number(b.type === "cash") - Number(a.type === "cash")).map(({ id, name }) => ({ id, name }));
}

export type Held = {
  totalMinor: number;
  morningMinor: number;
  fundMorningMinor: number;
  fundBooksMinor: number;
  booksMinor: number;
  byFee: Map<string, number>;
};

// What is held for the school, from the school_cash_moves view.
export async function getHeld(): Promise<Held> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("school_held_by_source");
  if (error) fail("school money", error);
  const held: Held = { totalMinor: 0, morningMinor: 0, fundMorningMinor: 0, fundBooksMinor: 0, booksMinor: 0, byFee: new Map() };
  for (const row of data) {
    held.totalMinor += row.amount_minor;
    if (row.source === "morning") held.morningMinor += row.amount_minor;
    else if (row.source === "fund_morning") held.fundMorningMinor += row.amount_minor;
    else if (row.source === "fund_books") held.fundBooksMinor += row.amount_minor;
    else if (row.source === "books") held.booksMinor += row.amount_minor;
    else if (row.ref_id) held.byFee.set(row.ref_id, (held.byFee.get(row.ref_id) ?? 0) + row.amount_minor);
  }
  return held;
}

// The total held, or null when School money is not set up (Home card).
export async function getHeldTotal(): Promise<number | null> {
  const supabase = await client();
  const { data: settings, error: settingsError } = await supabase.from("school_settings").select("user_id").maybeSingle();
  if (settingsError) fail("the School money settings", settingsError);
  if (!settings) return null;
  const { data, error } = await supabase.rpc("school_held_by_source");
  if (error) fail("school money", error);
  return data.reduce((total, row) => total + row.amount_minor, 0);
}

// Every matching row, page by page: the API returns at most 1,000 rows per
// request and silently leaves out the rest (src/lib/pages.ts). Errors
// throw, like the single reads here.
async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: null }> {
  return { data: await fetchAllPages(page), error: null };
}

// --- Morning classes -----------------------------------------------------

export type DayRecord = MorningDay & { reason: NoClassReason | null; note: string };

export type WeekRecord = {
  id: string;
  settledOn: string;
  classDays: number;
  collectedMinor: number;
  schoolMinor: number;
  savingsRule: "all" | "half" | "none";
  savingsDay: string | null;
  savingsMinor: number;
  leftoverMinor: number;
  markersMinor: number;
  assistantMinor: number;
  eachMinor: number;
  shares: { id: string; name: string; isMe: boolean; amountMinor: number; paidOn: string | null }[];
};

export type Sharer = { id: string; name: string; isMe: boolean; archived: boolean };

const DAY_COLUMNS =
  "day, no_class, reason, note, full_1, full_2, full_3, less_1_minor, less_2_minor, less_3_minor, fee_minor, school_minor";

type DayRow = {
  day: string;
  no_class: boolean;
  reason: NoClassReason | null;
  note: string;
  full_1: number;
  full_2: number;
  full_3: number;
  less_1_minor: number;
  less_2_minor: number;
  less_3_minor: number;
  fee_minor: number;
  school_minor: number;
};

function toDay(row: DayRow): DayRecord {
  return {
    date: row.day,
    noClass: row.no_class,
    reason: row.reason,
    note: row.note,
    full: [row.full_1, row.full_2, row.full_3],
    lessMinor: [row.less_1_minor, row.less_2_minor, row.less_3_minor],
    feeMinor: row.fee_minor,
    schoolMinor: row.school_minor,
  };
}

export async function getMorningWeek(monday: string, friday: string): Promise<{ days: DayRecord[]; week: WeekRecord | null }> {
  const supabase = await client();
  const [days, weeks] = await Promise.all([
    supabase.from("mc_days").select(DAY_COLUMNS).gte("day", monday).lte("day", friday).order("day"),
    supabase.from("mc_weeks").select("*").eq("week_start", monday).maybeSingle(),
  ]);
  if (days.error) fail("the week", days.error);
  if (weeks.error) fail("the week", weeks.error);
  const w = weeks.data;
  let week: WeekRecord | null = null;
  if (w) {
    const { data: shares, error } = await supabase
      .from("mc_shares")
      .select("id, name, is_me, amount_minor, paid_on")
      .eq("week_id", w.id)
      .order("is_me", { ascending: false })
      .order("name");
    if (error) fail("the shares", error);
    week = {
      id: w.id,
      settledOn: w.settled_on,
      classDays: w.class_days,
      collectedMinor: w.collected_minor,
      schoolMinor: w.school_minor,
      savingsRule: w.savings_rule,
      savingsDay: w.savings_day,
      savingsMinor: w.savings_minor,
      leftoverMinor: w.leftover_minor,
      markersMinor: w.markers_minor,
      assistantMinor: w.assistant_minor,
      eachMinor: w.each_minor,
      shares: shares.map((s) => ({ id: s.id, name: s.name, isMe: s.is_me, amountMinor: s.amount_minor, paidOn: s.paid_on })),
    };
  }
  return { days: days.data.map(toDay), week };
}

export async function getMorningDay(date: string): Promise<DayRecord | null> {
  const supabase = await client();
  const { data, error } = await supabase.from("mc_days").select(DAY_COLUMNS).eq("day", date).maybeSingle();
  notFoundOrFail("the day", error);
  return data ? toDay(data) : null;
}

export async function isWeekSettled(monday: string): Promise<boolean> {
  const supabase = await client();
  const { data, error } = await supabase.from("mc_weeks").select("id").eq("week_start", monday).maybeSingle();
  if (error) fail("the week", error);
  return Boolean(data);
}

export async function getSharers(): Promise<Sharer[]> {
  const supabase = await client();
  const { data, error } = await everyRow((from, to) => supabase.from("mc_sharers").select("id, name, is_me, archived_at").order("id").range(from, to));
  if (error) fail("the sharers", error);
  return data
    .map((s) => ({ id: s.id, name: s.name, isMe: s.is_me, archived: s.archived_at !== null }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
}

// Shares of settled weeks not yet ticked as paid.
export async function getUnpaidShares(): Promise<{ count: number; amountMinor: number }> {
  const supabase = await client();
  const { data, error } = await everyRow((from, to) => supabase.from("mc_shares").select("amount_minor").is("paid_on", null).order("id").range(from, to));
  if (error) fail("the shares", error);
  return { count: data.length, amountMinor: data.reduce((total, s) => total + s.amount_minor, 0) };
}

// --- Funds -----------------------------------------------------------------

export type FundEntry = { key: string; date: string; label: string; detail: string; amountMinor: number; spendId?: string };

export async function getFund(fund: Fund): Promise<{ balanceMinor: number; inMinor: number; outMinor: number; entries: FundEntry[] }> {
  const supabase = await client();
  const spends = await supabase
    .from("school_fund_spends")
    .select("id, amount_minor, spent_on, purpose, note")
    .eq("fund", fund)
    .order("spent_on", { ascending: false });
  if (spends.error) fail("the fund", spends.error);

  const entries: FundEntry[] = spends.data.map((s) => ({
    key: s.id,
    spendId: s.id,
    date: s.spent_on,
    label: s.note || purposeLabel(s.purpose),
    detail: purposeLabel(s.purpose),
    amountMinor: -s.amount_minor,
  }));

  if (fund === "morning") {
    const { data, error } = await supabase
      .from("mc_weeks")
      .select("id, week_start, settled_on, savings_minor, savings_rule")
      .gt("savings_minor", 0)
      .order("week_start", { ascending: false });
    if (error) fail("the fund", error);
    for (const w of data) {
      entries.push({
        key: w.id,
        date: w.settled_on,
        label: `Week of ${formatDate(w.week_start)}`,
        detail: w.savings_rule === "half" ? "Half of the last class day" : w.savings_rule === "all" ? "Last class day" : "Leftover pesewas",
        amountMinor: w.savings_minor,
      });
    }
  } else {
    const { data, error } = await supabase
      .from("book_orders")
      .select("id, given_on, teachers_minor")
      .not("given_on", "is", null)
      .gt("teachers_minor", 0);
    if (error) fail("the fund", error);
    // One line per day books were given out.
    const byDay = new Map<string, { amount: number; books: number }>();
    for (const o of data) {
      const day = o.given_on as string;
      const entry = byDay.get(day) ?? { amount: 0, books: 0 };
      entry.amount += o.teachers_minor ?? 0;
      entry.books += 1;
      byDay.set(day, entry);
    }
    for (const [day, entry] of byDay) {
      entries.push({
        key: `books-${day}`,
        date: day,
        label: "Past questions books",
        detail: `${entry.books} book${entry.books === 1 ? "" : "s"} given out`,
        amountMinor: entry.amount,
      });
    }
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  const inMinor = entries.filter((e) => e.amountMinor > 0).reduce((t, e) => t + e.amountMinor, 0);
  const outMinor = -entries.filter((e) => e.amountMinor < 0).reduce((t, e) => t + e.amountMinor, 0);
  return { balanceMinor: inMinor - outMinor, inMinor, outMinor, entries };
}

const PURPOSES: Record<FundPurpose, string> = {
  sports: "Sports",
  science_fair: "Science fair",
  teacher_books: "Books for teachers",
  other: "Other",
};

function purposeLabel(purpose: FundPurpose): string {
  return PURPOSES[purpose];
}

// What each savings fund has now: saved in, minus spent.
export async function getFundBalances(): Promise<Record<Fund, number>> {
  const supabase = await client();
  const [weeks, orders, spends] = await Promise.all([
    everyRow((from, to) => supabase.from("mc_weeks").select("savings_minor").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_orders").select("teachers_minor").not("given_on", "is", null).order("id").range(from, to)),
    everyRow((from, to) => supabase.from("school_fund_spends").select("fund, amount_minor").order("id").range(from, to)),
  ]);
  if (weeks.error) fail("the funds", weeks.error);
  if (orders.error) fail("the funds", orders.error);
  if (spends.error) fail("the funds", spends.error);
  const spent = (fund: Fund) => spends.data.filter((s) => s.fund === fund).reduce((t, s) => t + s.amount_minor, 0);
  return {
    morning: weeks.data.reduce((t, w) => t + w.savings_minor, 0) - spent("morning"),
    books: orders.data.reduce((t, o) => t + (o.teachers_minor ?? 0), 0) - spent("books"),
  };
}

// --- Students and fees ---------------------------------------------------

export type Student = { id: string; name: string; className: string };

export async function getStudents(): Promise<Student[]> {
  const supabase = await client();
  const { data } = await everyRow((from, to) =>
    supabase.from("school_students").select("id, name, class_name").is("archived_at", null).order("name").order("id").range(from, to),
  );
  return data.map((s) => ({ id: s.id, name: s.name, className: s.class_name }));
}

export type FeeSummary = { id: string; name: string; amountMinor: number; archived: boolean };

export async function getFees(): Promise<FeeSummary[]> {
  const supabase = await client();
  const { data, error } = await everyRow((from, to) => supabase.from("school_fees").select("id, name, amount_minor, archived_at").order("created_at", { ascending: false }).order("id").range(from, to));
  if (error) fail("fees", error);
  return data.map((f) => ({ id: f.id, name: f.name, amountMinor: f.amount_minor, archived: f.archived_at !== null }));
}

export type FeeStudent = {
  id: string;
  studentId: string;
  name: string;
  className: string;
  payableMinor: number;
  paidMinor: number;
  payments: { id: string; amountMinor: number; paidOn: string; note: string }[];
};

export type Handover = { id: string; toWhom: Recipient; amountMinor: number; handedOn: string; note: string };

export type FeeDetail = FeeSummary & { students: FeeStudent[]; handovers: Handover[] };

export async function getFee(id: string): Promise<FeeDetail | null> {
  const supabase = await client();
  const { data: fee, error } = await supabase.from("school_fees").select("id, name, amount_minor, archived_at").eq("id", id).maybeSingle();
  notFoundOrFail("the fee", error);
  if (!fee) return null;
  const [students, payments, handovers] = await Promise.all([
    everyRow((from, to) => supabase.from("school_fee_students").select("id, student_id, payable_minor").eq("fee_id", id).order("id").range(from, to)),
    everyRow((from, to) =>
      supabase
        .from("school_fee_payments")
        .select("id, fee_student_id, amount_minor, paid_on, note, school_fee_students!inner(fee_id)")
        .eq("school_fee_students.fee_id", id)
        .order("paid_on")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) => supabase.from("school_handovers").select("id, to_whom, amount_minor, handed_on, note").eq("fee_id", id).order("handed_on", { ascending: false }).order("id").range(from, to)),
  ]);
  if (students.error) fail("the fee", students.error);
  if (payments.error) fail("the fee", payments.error);
  if (handovers.error) fail("the fee", handovers.error);
  const names = await studentNames(supabase, students.data.map((s) => s.student_id));
  const list: FeeStudent[] = students.data.map((s) => {
    const own = payments.data.filter((p) => p.fee_student_id === s.id);
    const student = names.get(s.student_id) ?? { name: "?", className: "" };
    return {
      id: s.id,
      studentId: s.student_id,
      name: student.name,
      className: student.className,
      payableMinor: s.payable_minor,
      paidMinor: own.reduce((t, p) => t + p.amount_minor, 0),
      payments: own.map((p) => ({ id: p.id, amountMinor: p.amount_minor, paidOn: p.paid_on, note: p.note })),
    };
  });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: fee.id,
    name: fee.name,
    amountMinor: fee.amount_minor,
    archived: fee.archived_at !== null,
    students: list,
    handovers: handovers.data.map((h) => ({ id: h.id, toWhom: h.to_whom, amountMinor: h.amount_minor, handedOn: h.handed_on, note: h.note })),
  };
}

async function studentNames(supabase: Client, ids: string[]): Promise<Map<string, { name: string; className: string }>> {
  if (ids.length === 0) return new Map();
  // All students, page by page: a long list of ids would not fit in the address.
  const { data } = await everyRow((from, to) =>
    supabase.from("school_students").select("id, name, class_name").order("id").range(from, to),
  );
  const wanted = new Set(ids);
  return new Map(data.filter((s) => wanted.has(s.id)).map((s) => [s.id, { name: s.name, className: s.class_name }]));
}

// --- Past questions books ------------------------------------------------

export type Subject = { id: string; name: string; priceMinor: number; bought: number; given: number; archived: boolean };

export type BookStudent = {
  id: string;
  name: string;
  className: string;
  ordered: number;
  given: number;
  payableMinor: number;
  paidMinor: number;
};

export type BooksOverview = {
  subjects: Subject[];
  students: BookStudent[];
  paidInMinor: number;
  spentOnBooksMinor: number;
  given: { books: number; priceMinor: number; costMinor: number; transportMinor: number; mineMinor: number; teachersMinor: number };
};

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await client();
  const [subjects, purchases, orders] = await Promise.all([
    everyRow((from, to) => supabase.from("book_subjects").select("id, name, price_minor, archived_at").order("name").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_purchases").select("subject_id, quantity").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_orders").select("subject_id, given_on").order("id").range(from, to)),
  ]);
  if (subjects.error) fail("subjects", subjects.error);
  if (purchases.error) fail("subjects", purchases.error);
  if (orders.error) fail("subjects", orders.error);
  return subjects.data.map((s) => ({
    id: s.id,
    name: s.name,
    priceMinor: s.price_minor,
    archived: s.archived_at !== null,
    bought: purchases.data.filter((p) => p.subject_id === s.id).reduce((t, p) => t + p.quantity, 0),
    given: orders.data.filter((o) => o.subject_id === s.id && o.given_on !== null).length,
  }));
}

export async function getBooksOverview(): Promise<BooksOverview> {
  const supabase = await client();
  const [subjects, orders, payments, purchases] = await Promise.all([
    getSubjects(),
    everyRow((from, to) => supabase.from("book_orders").select("student_id, price_minor, given_on, cost_minor, transport_minor, mine_minor, teachers_minor").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_payments").select("student_id, amount_minor").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_purchases").select("amount_minor").order("id").range(from, to)),
  ]);
  if (orders.error) fail("books", orders.error);
  if (payments.error) fail("books", payments.error);
  if (purchases.error) fail("books", purchases.error);

  const ids = [...new Set([...orders.data.map((o) => o.student_id), ...payments.data.map((p) => p.student_id)])];
  const names = await studentNames(supabase, ids);
  const students: BookStudent[] = ids.map((id) => {
    const own = orders.data.filter((o) => o.student_id === id);
    const student = names.get(id) ?? { name: "?", className: "" };
    return {
      id,
      name: student.name,
      className: student.className,
      ordered: own.length,
      given: own.filter((o) => o.given_on !== null).length,
      payableMinor: own.reduce((t, o) => t + o.price_minor, 0),
      paidMinor: payments.data.filter((p) => p.student_id === id).reduce((t, p) => t + p.amount_minor, 0),
    };
  });
  students.sort((a, b) => a.name.localeCompare(b.name));

  const given = orders.data.filter((o) => o.given_on !== null);
  const total = (pick: (o: (typeof given)[number]) => number | null) => given.reduce((t, o) => t + (pick(o) ?? 0), 0);
  return {
    subjects,
    students,
    paidInMinor: payments.data.reduce((t, p) => t + p.amount_minor, 0),
    spentOnBooksMinor: purchases.data.reduce((t, p) => t + p.amount_minor, 0),
    given: {
      books: given.length,
      priceMinor: total((o) => o.price_minor),
      costMinor: total((o) => o.cost_minor),
      transportMinor: total((o) => o.transport_minor),
      mineMinor: total((o) => o.mine_minor),
      teachersMinor: total((o) => o.teachers_minor),
    },
  };
}

export type BookOrder = {
  id: string;
  subjectId: string;
  subject: string;
  priceMinor: number;
  givenOn: string | null;
  givenSeq: number | null;
  split: { costMinor: number; transportMinor: number; mineMinor: number; teachersMinor: number } | null;
};

export async function getBookStudent(id: string): Promise<{
  student: Student;
  orders: BookOrder[];
  payments: { id: string; amountMinor: number; paidOn: string; note: string }[];
} | null> {
  const supabase = await client();
  const { data: student, error } = await supabase.from("school_students").select("id, name, class_name").eq("id", id).maybeSingle();
  notFoundOrFail("the student", error);
  if (!student) return null;
  const [orders, payments, subjects] = await Promise.all([
    everyRow((from, to) => supabase.from("book_orders").select("*").eq("student_id", id).order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_payments").select("id, amount_minor, paid_on, note").eq("student_id", id).order("paid_on").order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_subjects").select("id, name").order("id").range(from, to)),
  ]);
  if (orders.error) fail("the student's books", orders.error);
  if (payments.error) fail("the student's books", payments.error);
  if (subjects.error) fail("the student's books", subjects.error);
  const subjectName = new Map(subjects.data.map((s) => [s.id, s.name]));
  return {
    student: { id: student.id, name: student.name, className: student.class_name },
    orders: orders.data
      .map((o) => ({
        id: o.id,
        subjectId: o.subject_id,
        subject: subjectName.get(o.subject_id) ?? "?",
        priceMinor: o.price_minor,
        givenOn: o.given_on,
        givenSeq: o.given_seq,
        split:
          o.given_on === null
            ? null
            : {
                costMinor: o.cost_minor ?? 0,
                transportMinor: o.transport_minor ?? 0,
                mineMinor: o.mine_minor ?? 0,
                teachersMinor: o.teachers_minor ?? 0,
              },
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject)),
    payments: payments.data.map((p) => ({ id: p.id, amountMinor: p.amount_minor, paidOn: p.paid_on, note: p.note })),
  };
}

// The last copy given out of each subject: only that one can be undone.
export async function getLastGivenSeq(): Promise<Map<string, number>> {
  const supabase = await client();
  const { data, error } = await everyRow((from, to) => supabase.from("book_orders").select("subject_id, given_seq").not("given_seq", "is", null).order("id").range(from, to));
  if (error) fail("books", error);
  const last = new Map<string, number>();
  for (const o of data) last.set(o.subject_id, Math.max(last.get(o.subject_id) ?? 0, o.given_seq ?? 0));
  return last;
}

export async function getPurchases(): Promise<{ id: string; subject: string; quantity: number; amountMinor: number; boughtOn: string }[]> {
  const supabase = await client();
  const [purchases, subjects] = await Promise.all([
    everyRow((from, to) => supabase.from("book_purchases").select("id, subject_id, quantity, amount_minor, bought_on").order("bought_on", { ascending: false }).order("id").range(from, to)),
    everyRow((from, to) => supabase.from("book_subjects").select("id, name").order("id").range(from, to)),
  ]);
  if (purchases.error) fail("purchases", purchases.error);
  if (subjects.error) fail("purchases", subjects.error);
  const names = new Map(subjects.data.map((s) => [s.id, s.name]));
  return purchases.data.map((p) => ({
    id: p.id,
    subject: names.get(p.subject_id) ?? "?",
    quantity: p.quantity,
    amountMinor: p.amount_minor,
    boughtOn: p.bought_on,
  }));
}

// --- Backup ------------------------------------------------------------------

// Every School money record, for "Export everything" (D-57), or null when
// School money is not set up. Read page by page, like the rest of the backup.
export async function getSchoolBackup(): Promise<SchoolBackup | null> {
  const settings = await getSchoolSettings();
  if (!settings) return null;
  const supabase = await client();
  const [held, days, weeks, shares, spends, fees, feeStudents, feePayments, handovers, subjects, purchases, orders, bookPayments, students] =
    await Promise.all([
      supabase.rpc("school_held_by_source"),
      everyRow((from, to) => supabase.from("mc_days").select(DAY_COLUMNS).order("day").range(from, to)),
      everyRow((from, to) => supabase.from("mc_weeks").select("*").order("week_start").range(from, to)),
      everyRow((from, to) => supabase.from("mc_shares").select("week_id, name, is_me, amount_minor, paid_on").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("school_fund_spends").select("fund, spent_on, amount_minor, purpose, note").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("school_fees").select("id, name, amount_minor, archived_at").order("created_at").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("school_fee_students").select("id, fee_id, student_id, payable_minor").order("id").range(from, to)),
      everyRow((from, to) =>
        supabase.from("school_fee_payments").select("fee_student_id, paid_on, amount_minor, note").order("id").range(from, to),
      ),
      everyRow((from, to) => supabase.from("school_handovers").select("fee_id, to_whom, handed_on, amount_minor, note").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("book_subjects").select("id, name, price_minor").order("name").order("id").range(from, to)),
      everyRow((from, to) =>
        supabase.from("book_purchases").select("subject_id, bought_on, quantity, amount_minor, note").order("id").range(from, to),
      ),
      everyRow((from, to) => supabase.from("book_orders").select("*").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("book_payments").select("student_id, paid_on, amount_minor, note").order("id").range(from, to)),
      everyRow((from, to) => supabase.from("school_students").select("id, name, class_name").order("name").order("id").range(from, to)),
    ]);
  if (held.error) fail("school money", held.error);

  const subjectName = new Map(subjects.data.map((s) => [s.id, s.name]));
  const student = new Map(students.data.map((s) => [s.id, s]));
  const bookStudentIds = new Set([...orders.data.map((o) => o.student_id), ...bookPayments.data.map((p) => p.student_id)]);

  return {
    accountName: settings.accountName,
    heldMinor: held.data.reduce((total, row) => total + row.amount_minor, 0),
    days: days.data.map(toDay),
    weeks: weeks.data.map((w) => ({
      weekStart: w.week_start,
      settledOn: w.settled_on,
      classDays: w.class_days,
      collectedMinor: w.collected_minor,
      schoolMinor: w.school_minor,
      savingsMinor: w.savings_minor,
      markersMinor: w.markers_minor,
      assistantMinor: w.assistant_minor,
      eachMinor: w.each_minor,
      shares: shares.data
        .filter((s) => s.week_id === w.id)
        .sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.name.localeCompare(b.name))
        .map((s) => ({ name: s.name, isMe: s.is_me, amountMinor: s.amount_minor, paidOn: s.paid_on })),
    })),
    fundSpends: spends.data.map((s) => ({ fund: s.fund, spentOn: s.spent_on, amountMinor: s.amount_minor, purpose: s.purpose, note: s.note })),
    fees: fees.data.map((fee) => ({
      name: fee.name,
      amountMinor: fee.amount_minor,
      archived: fee.archived_at !== null,
      students: feeStudents.data
        .filter((fs) => fs.fee_id === fee.id)
        .map((fs) => ({
          name: student.get(fs.student_id)?.name ?? "?",
          className: student.get(fs.student_id)?.class_name ?? "",
          payableMinor: fs.payable_minor,
          payments: feePayments.data
            .filter((p) => p.fee_student_id === fs.id)
            .map((p) => ({ paidOn: p.paid_on, amountMinor: p.amount_minor, note: p.note })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      handovers: handovers.data
        .filter((h) => h.fee_id === fee.id)
        .map((h) => ({ toWhom: h.to_whom, handedOn: h.handed_on, amountMinor: h.amount_minor, note: h.note })),
    })),
    subjects: subjects.data.map((s) => ({ name: s.name, priceMinor: s.price_minor })),
    purchases: purchases.data.map((p) => ({
      subject: subjectName.get(p.subject_id) ?? "?",
      boughtOn: p.bought_on,
      quantity: p.quantity,
      amountMinor: p.amount_minor,
      note: p.note,
    })),
    bookStudents: students.data
      .filter((s) => bookStudentIds.has(s.id))
      .map((s) => ({
        name: s.name,
        className: s.class_name,
        orders: orders.data
          .filter((o) => o.student_id === s.id)
          .map((o) => ({
            subject: subjectName.get(o.subject_id) ?? "?",
            priceMinor: o.price_minor,
            givenOn: o.given_on,
            split:
              o.given_on === null
                ? null
                : {
                    costMinor: o.cost_minor ?? 0,
                    transportMinor: o.transport_minor ?? 0,
                    mineMinor: o.mine_minor ?? 0,
                    teachersMinor: o.teachers_minor ?? 0,
                  },
          }))
          .sort((a, b) => a.subject.localeCompare(b.subject)),
        payments: bookPayments.data
          .filter((p) => p.student_id === s.id)
          .map((p) => ({ paidOn: p.paid_on, amountMinor: p.amount_minor, note: p.note })),
      })),
  };
}
