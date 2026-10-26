"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/dates";
import { formValues } from "@/lib/form-data";
import { parseBookSplitForm, parsePaymentForm, parsePurchaseForm, parseSubjectForm } from "@/lib/school/forms";
import { createClient } from "@/lib/supabase/server";

import type { SchoolFormState } from "./form-kit";
import { CHECK_CONNECTION, refreshAll, schoolError, today } from "./shared-actions";

// Past questions books (D-56).

function failed(error: { message: string }, values: Record<string, string>, field?: string): SchoolFormState {
  const message = schoolError(error);
  return field && message !== CHECK_CONNECTION ? { errors: { [field]: message }, values } : { errors: {}, formError: message, values };
}

export async function saveSubject(id: string | null, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseSubjectForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const row = { name: parsed.value.name, price_minor: parsed.value.priceMinor };
  const { error } = id ? await supabase.from("book_subjects").update(row).eq("id", id) : await supabase.from("book_subjects").insert(row);
  if (error) return failed(error, values, "name");
  refreshAll();
  if (id) redirect("/school/books/subjects");
  return { errors: {}, saved: { at: Date.now() } };
}

export async function saveBookSplit(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseBookSplitForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .update({ book_transport_minor: parsed.value.transportMinor, book_mine_minor: parsed.value.mineMinor })
    .not("user_id", "is", null)
    .select("user_id");
  if (error) return failed(error, values);
  if (data.length === 0) return { errors: {}, formError: schoolError({ message: "set up School money first" }), values };
  refreshAll();
  redirect("/school/books/subjects");
}

export async function recordPurchase(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parsePurchaseForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { error } = await supabase.from("book_purchases").insert({
    subject_id: parsed.value.subjectId,
    quantity: parsed.value.quantity,
    amount_minor: parsed.value.amountMinor,
    bought_on: parsed.value.boughtOn,
    note: parsed.value.note,
  });
  if (error) return failed(error, values);
  refreshAll();
  return { errors: {}, saved: { at: Date.now() } };
}

export async function deletePurchase(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("book_purchases").delete().eq("id", id);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

// A student's books: the subjects they want (each at its price now), and
// what they paid (may be 0 when they only choose subjects first).
export async function recordBookPayment(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parsePaymentForm(values, today(), { allowZero: true });
  if (!parsed.ok) return { errors: parsed.errors, values };
  const subjectIds = [
    ...new Set(formData.getAll("subjects").filter((v): v is string => typeof v === "string" && z.uuid().safeParse(v).success)),
  ];
  if (parsed.value.amountMinor === 0 && subjectIds.length === 0) {
    return { errors: { amount: "Enter what was paid, or choose the books they want." }, values };
  }

  const supabase = await createClient();
  const { student, amountMinor, paidOn, note } = parsed.value;
  let studentId: string;
  if ("id" in student) {
    studentId = student.id;
  } else {
    const { data: found, error: findError } = await supabase
      .from("school_students")
      .select("id, class_name")
      .ilike("name", student.name.replace(/[%_\\]/g, (c) => `\\${c}`));
    if (findError) return failed(findError, values);
    const match = found.find((s) => s.class_name.toLowerCase() === student.className.toLowerCase());
    if (match) {
      studentId = match.id;
    } else {
      const { data, error } = await supabase.from("school_students").insert({ name: student.name, class_name: student.className }).select("id").single();
      if (error) return failed(error, values, "newName");
      studentId = data.id;
    }
  }

  if (subjectIds.length > 0) {
    const [{ data: subjects, error: subjectsError }, { data: existing, error: existingError }] = await Promise.all([
      supabase.from("book_subjects").select("id, price_minor").in("id", subjectIds),
      supabase.from("book_orders").select("subject_id").eq("student_id", studentId),
    ]);
    if (subjectsError || existingError) return { errors: {}, formError: CHECK_CONNECTION, values };
    const have = new Set(existing.map((o) => o.subject_id));
    const rows = subjects.filter((s) => !have.has(s.id)).map((s) => ({ student_id: studentId, subject_id: s.id, price_minor: s.price_minor }));
    if (rows.length > 0) {
      const { error } = await supabase.from("book_orders").insert(rows);
      if (error) return failed(error, values);
    }
  }
  if (amountMinor > 0) {
    const { error } = await supabase.from("book_payments").insert({ student_id: studentId, amount_minor: amountMinor, paid_on: paidOn, note });
    if (error) return failed(error, values);
  }
  refreshAll();
  redirect(`/school/books/students/${studentId}`);
}

export async function giveOutBooks(studentId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const orderIds = formData.getAll("orders").filter((v): v is string => typeof v === "string" && z.uuid().safeParse(v).success);
  const givenOn = values.givenOn ?? "";
  const errors: Record<string, string> = {};
  if (orderIds.length === 0) errors.orders = "Tick the books you are giving out.";
  if (!isIsoDate(givenOn)) errors.givenOn = "Enter a real date.";
  else if (givenOn > today()) errors.givenOn = "The date cannot be in the future.";
  if (Object.keys(errors).length > 0) return { errors, values };
  const supabase = await createClient();
  const { error } = await supabase.rpc("books_give_out", { p_order_ids: orderIds, p_given_on: givenOn });
  if (error) return failed(error, values);
  refreshAll();
  redirect(`/school/books/students/${studentId}`);
}

export async function undoGiveOut(orderId: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("books_undo_give", { p_order_id: orderId });
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function removeBookOrder(orderId: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("book_orders").delete().eq("id", orderId);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function deleteBookPayment(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("book_payments").delete().eq("id", id);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}
