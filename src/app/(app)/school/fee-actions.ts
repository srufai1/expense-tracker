"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import {
  parseFeeForm,
  parseHandoverForm,
  parseMyPartForm,
  parsePayableForm,
  parsePaymentForm,
  parseStudentsForm,
} from "@/lib/school/forms";
import { createClient } from "@/lib/supabase/server";

import type { SchoolFormState } from "./form-kit";
import { CHECK_CONNECTION, refreshAll, schoolError, today } from "./shared-actions";

// School fees (D-55): students, payments, hand-overs, and the developer's
// own part as income.

type Client = Awaited<ReturnType<typeof createClient>>;

function failed(error: { message: string }, values: Record<string, string>, field?: string): SchoolFormState {
  const message = schoolError(error);
  return field && message !== CHECK_CONNECTION ? { errors: { [field]: message }, values } : { errors: {}, formError: message, values };
}

export async function saveFee(id: string | null, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseFeeForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const row = { name: parsed.value.name, amount_minor: parsed.value.amountMinor };
  const { data, error } = id
    ? await supabase.from("school_fees").update(row).eq("id", id).select("id").single()
    : await supabase.from("school_fees").insert(row).select("id").single();
  if (error) return failed(error, values, "name");
  refreshAll();
  redirect(`/school/fees/${data.id}`);
}

export async function setFeeArchived(id: string, archived: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_fees")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

// Finds a student by name and class (any capitals), or adds them.
async function studentId(supabase: Client, name: string, className: string): Promise<{ id: string } | { error: { message: string } }> {
  const { data, error } = await supabase
    .from("school_students")
    .select("id, name, class_name")
    .ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`));
  if (error) return { error };
  const found = data.find((s) => s.class_name.toLowerCase() === className.toLowerCase());
  if (found) return { id: found.id };
  const { data: added, error: addError } = await supabase.from("school_students").insert({ name, class_name: className }).select("id").single();
  return addError ? { error: addError } : { id: added.id };
}

// Puts a student on a fee at its usual amount (nothing when already on it).
async function enrol(supabase: Client, feeId: string, student: string): Promise<{ id: string } | { error: { message: string } }> {
  const { data: existing, error } = await supabase
    .from("school_fee_students")
    .select("id")
    .eq("fee_id", feeId)
    .eq("student_id", student)
    .maybeSingle();
  if (error) return { error };
  if (existing) return { id: existing.id };
  const { data: fee, error: feeError } = await supabase.from("school_fees").select("amount_minor").eq("id", feeId).single();
  if (feeError) return { error: feeError };
  const { data, error: addError } = await supabase
    .from("school_fee_students")
    .insert({ fee_id: feeId, student_id: student, payable_minor: fee.amount_minor })
    .select("id")
    .single();
  return addError ? { error: addError } : { id: data.id };
}

export async function addStudentsToFee(feeId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseStudentsForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  for (const name of parsed.value.names) {
    const student = await studentId(supabase, name, parsed.value.className);
    if ("error" in student) return failed(student.error, values);
    const enrolled = await enrol(supabase, feeId, student.id);
    if ("error" in enrolled) return failed(enrolled.error, values);
  }
  refreshAll();
  redirect(`/school/fees/${feeId}`);
}

export async function recordFeePayment(feeId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parsePaymentForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { student, amountMinor, paidOn, note } = parsed.value;
  const found = "id" in student ? { id: student.id } : await studentId(supabase, student.name, student.className);
  if ("error" in found) return failed(found.error, values, "newName");
  const enrolled = await enrol(supabase, feeId, found.id);
  if ("error" in enrolled) return failed(enrolled.error, values, "studentId");
  const { error } = await supabase
    .from("school_fee_payments")
    .insert({ fee_student_id: enrolled.id, amount_minor: amountMinor, paid_on: paidOn, note });
  if (error) return failed(error, values);
  refreshAll();
  return { errors: {}, saved: { at: Date.now() } };
}

export async function setPayable(feeStudentId: string, feeId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parsePayableForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { error } = await supabase.from("school_fee_students").update({ payable_minor: parsed.value.payableMinor }).eq("id", feeStudentId);
  if (error) return failed(error, values);
  refreshAll();
  redirect(`/school/fees/${feeId}`);
}

export async function deleteFeePayment(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("school_fee_payments").delete().eq("id", id);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function removeFeeStudent(feeStudentId: string, feeId: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("school_fee_students").delete().eq("id", feeStudentId);
  if (error) return schoolError(error);
  refreshAll();
  redirect(`/school/fees/${feeId}`);
}

export async function handOver(feeId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseHandoverForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { error } = await supabase.rpc("school_hand_over", {
    p_fee_id: feeId,
    p_to_whom: parsed.value.toWhom,
    p_amount_minor: parsed.value.amountMinor,
    p_handed_on: parsed.value.handedOn,
    p_note: parsed.value.note,
  });
  if (error) return failed(error, values, /more than you are holding/.test(error.message) ? "amount" : undefined);
  refreshAll();
  redirect(`/school/fees/${feeId}`);
}

export async function undoHandover(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("school_undo_handover", { p_id: id });
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

// The developer's own part, given back to them: saved as income in the
// "School money" category, into the school money account.
export async function recordMyPart(feeId: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseMyPartForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const [{ data: settings, error: settingsError }, { data: fee, error: feeError }] = await Promise.all([
    supabase.from("school_settings").select("account_id, income_category_id").maybeSingle(),
    supabase.from("school_fees").select("name").eq("id", feeId).single(),
  ]);
  if (settingsError || feeError) return { errors: {}, formError: CHECK_CONNECTION, values };
  if (!settings) return { errors: {}, formError: schoolError({ message: "set up School money first" }), values };
  const { amountMinor, receivedOn, note } = parsed.value;
  const { error } = await supabase.from("transactions").insert({
    kind: "income",
    occurred_on: receivedOn,
    account_id: settings.account_id,
    category_id: settings.income_category_id,
    amount_minor: amountMinor,
    currency: "GHS",
    fx_rate: 1,
    fx_source: "none",
    fx_rate_date: null,
    amount_ghs_minor: amountMinor,
    account_amount_minor: amountMinor,
    note: `${fee.name}: my part${note ? ` (${note})` : ""}`.slice(0, 200),
  });
  if (error) return failed(error, values);
  refreshAll();
  redirect(`/school/fees/${feeId}`);
}
