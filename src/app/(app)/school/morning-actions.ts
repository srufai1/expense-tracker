"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form-data";
import { settleWeek } from "@/lib/school/morning";
import {
  parseFundSpendForm,
  parseMorningDayForm,
  parseNoClassForm,
  parseSettleForm,
  parseSharerForm,
} from "@/lib/school/forms";
import type { Fund } from "@/lib/school/fees";
import { mondayOf, schoolWeekDays } from "@/lib/school/week";
import { createClient } from "@/lib/supabase/server";

import type { SchoolFormState } from "./form-kit";
import { getMorningWeek } from "./data";
import { CHECK_CONNECTION, refreshAll, schoolError, today } from "./shared-actions";

// Morning classes (D-54) and the savings funds.

// Where school money is kept. Makes the "School money" income category and
// the "Me" sharer the first time.
export async function setUpSchoolMoney(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  if (!z.uuid().safeParse(values.accountId).success) return { errors: { accountId: "Choose an account." }, values };

  const supabase = await createClient();
  const { data: found, error: findError } = await supabase
    .from("categories")
    .select("id")
    .eq("kind", "income")
    .is("parent_id", null)
    .ilike("name", "School money")
    .maybeSingle();
  if (findError) return { errors: {}, formError: CHECK_CONNECTION, values };
  let categoryId = found?.id;
  if (!categoryId) {
    const { data, error } = await supabase.from("categories").insert({ kind: "income", name: "School money" }).select("id").single();
    if (error) return { errors: {}, formError: CHECK_CONNECTION, values };
    categoryId = data.id;
  }

  const { data: existing } = await supabase.from("school_settings").select("user_id").maybeSingle();
  const { error } = existing
    ? await supabase.from("school_settings").update({ account_id: values.accountId }).eq("user_id", existing.user_id)
    : await supabase.from("school_settings").insert({ account_id: values.accountId, income_category_id: categoryId });
  if (error) {
    return /GHS accounts/.test(error.message)
      ? { errors: { accountId: "Choose one of your GHS accounts." }, values }
      : { errors: {}, formError: CHECK_CONNECTION, values };
  }

  const { data: me } = await supabase.from("mc_sharers").select("id").eq("is_me", true).maybeSingle();
  if (!me) await supabase.from("mc_sharers").insert({ name: "Me", is_me: true });

  refreshAll();
  redirect("/school");
}

const EMPTY_DAY = { full_1: 0, full_2: 0, full_3: 0, less_1_minor: 0, less_2_minor: 0, less_3_minor: 0 };

// Saves a day's row: changes it when it exists, adds it otherwise.
async function saveDay(
  day: string,
  row: { no_class: boolean; reason: "holiday" | "exams" | "other" | null; note: string } & typeof EMPTY_DAY,
): Promise<string | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mc_days").update(row).eq("day", day).select("day");
  if (error) return schoolError(error);
  if (data.length > 0) return undefined;
  const { error: insertError } = await supabase.from("mc_days").insert({ day, ...row });
  return insertError ? schoolError(insertError) : undefined;
}

export async function saveMorningDay(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseMorningDayForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const { date, full, lessMinor } = parsed.value;
  const failed = await saveDay(date, {
    no_class: false,
    reason: null,
    note: "",
    full_1: full[0],
    full_2: full[1],
    full_3: full[2],
    less_1_minor: lessMinor[0],
    less_2_minor: lessMinor[1],
    less_3_minor: lessMinor[2],
  });
  if (failed) return { errors: {}, formError: failed, values };
  refreshAll();
  redirect(`/school/morning?week=${mondayOf(date)}`);
}

export async function markNoClass(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseNoClassForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const { date, reason, note } = parsed.value;
  const failed = await saveDay(date, { no_class: true, reason, note, ...EMPTY_DAY });
  if (failed) return { errors: {}, formError: failed, values };
  refreshAll();
  redirect(`/school/morning?week=${mondayOf(date)}`);
}

// Removes a day's record (a day entered by mistake).
export async function clearMorningDay(day: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("mc_days").delete().eq("day", day);
  if (error) return schoolError(error);
  refreshAll();
  redirect(`/school/morning?week=${mondayOf(day)}`);
}

export async function settleMorningWeek(monday: string, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const sharerIds = formData.getAll("sharers").filter((value): value is string => typeof value === "string");
  const parsed = parseSettleForm(values, sharerIds, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const days = schoolWeekDays(monday);
  if (parsed.value.settledOn < monday) {
    return { errors: { settledOn: "Settle on a day of this week or after it." }, values };
  }

  const { days: recorded } = await getMorningWeek(monday, days[4]);
  const result = settleWeek({
    days: recorded,
    markersMinor: parsed.value.markersMinor,
    assistantMinor: parsed.value.assistantMinor,
    sharers: parsed.value.sharerIds.length,
  });
  if (!result.ok) return { errors: {}, formError: result.error, values };
  const v = result.value;

  const supabase = await createClient();
  const { error } = await supabase.rpc("mc_settle", {
    p_week_start: monday,
    p_settled_on: parsed.value.settledOn,
    p_savings_rule: v.savingsRule,
    p_savings_day: v.savingsDay,
    p_savings_minor: v.savingsMinor,
    p_leftover_minor: v.leftoverMinor,
    p_markers_minor: parsed.value.markersMinor,
    p_assistant_minor: parsed.value.assistantMinor,
    p_each_minor: v.eachMinor,
    p_sharer_ids: parsed.value.sharerIds,
  });
  if (error) return { errors: {}, formError: schoolError(error), values };
  refreshAll();
  redirect(`/school/morning?week=${monday}`);
}

export async function unsettleMorningWeek(weekId: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mc_unsettle", { p_week_id: weekId });
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function setSharePaid(shareId: string, paid: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mc_shares")
    .update({ paid_on: paid ? today() : null })
    .eq("id", shareId);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function addSharer(_previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseSharerForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { error } = await supabase.from("mc_sharers").insert({ name: parsed.value.name });
  if (error) {
    const message = schoolError(error);
    return message === CHECK_CONNECTION ? { errors: {}, formError: message, values } : { errors: { name: message }, values };
  }
  refreshAll();
  return { errors: {}, saved: { at: Date.now() } };
}

export async function setSharerArchived(id: string, archived: boolean): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mc_sharers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("is_me", false);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}

export async function spendFromFund(fund: Fund, _previous: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  await requireUser();
  const values = formValues(formData);
  const parsed = parseFundSpendForm(values, today());
  if (!parsed.ok) return { errors: parsed.errors, values };
  const supabase = await createClient();
  const { error } = await supabase.from("school_fund_spends").insert({
    fund,
    amount_minor: parsed.value.amountMinor,
    spent_on: parsed.value.spentOn,
    purpose: parsed.value.purpose,
    note: parsed.value.note,
  });
  if (error) {
    const message = schoolError(error);
    return /more than the fund/.test(error.message) ? { errors: { amount: message }, values } : { errors: {}, formError: message, values };
  }
  refreshAll();
  return { errors: {}, saved: { at: Date.now() } };
}

export async function deleteFundSpend(id: string): Promise<string | undefined> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("school_fund_spends").delete().eq("id", id);
  if (error) return schoolError(error);
  refreshAll();
  return undefined;
}
