"use client";

import { useState } from "react";

import { ViewDetails } from "@/components/view-details";
import { todayInAccra } from "@/lib/dates";
import { formatAmountForInput, formatMoney, parseAmount } from "@/lib/money";
import { FUND_PURPOSES, NO_CLASS_REASONS, RECIPIENTS } from "@/lib/school/fees";
import {
  BOOK_SPLIT_FIELDS,
  FEE_FIELDS,
  FUND_SPEND_FIELDS,
  HANDOVER_FIELDS,
  MORNING_DAY_FIELDS,
  MY_PART_FIELDS,
  NO_CLASS_FIELDS,
  PAYABLE_FIELDS,
  PAYMENT_FIELDS,
  PURCHASE_FIELDS,
  SETTLE_FIELDS,
  SHARER_FIELDS,
  STUDENTS_FIELDS,
  SUBJECT_FIELDS,
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
} from "@/lib/school/forms";
import { CLASSES, dayTotals, defaultDeductions, settleWeek, type MorningDay } from "@/lib/school/morning";

import { Chips, formObject, SchoolForm, SelectField, Stepper, TextArea, TextField, type SchoolFormState } from "./form-kit";

type Action = (state: SchoolFormState, formData: FormData) => Promise<SchoolFormState>;

const money = (minor: number) => formatMoney(minor, "GHS");
const typed = (text: string) => {
  const result = parseAmount(text.trim() === "" ? "0" : text, { allowZero: true });
  return result.ok ? result.minor : 0;
};

export function SetupForm({ action, accounts, current }: { action: Action; accounts: { id: string; name: string }[]; current?: string }) {
  return (
    <SchoolForm
      action={action}
      order={["accountId"]}
      submitLabel="Save"
      check={(form) => (new FormData(form).get("accountId") ? { ok: true } : { ok: false, errors: { accountId: "Choose an account." } })}
    >
      {({ errors, values }) => (
        <SelectField
          name="accountId"
          label="Where you keep the money"
          errors={errors}
          defaultValue={values.accountId ?? current ?? accounts[0]?.id ?? ""}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          placeholder="Choose an account"
        />
      )}
    </SchoolForm>
  );
}

// --- Morning classes -------------------------------------------------------

export function MorningDayForm({ action, day }: { action: Action; day: MorningDay }) {
  const [full, setFull] = useState(day.full.map(String));
  const [less, setLess] = useState(day.lessMinor.map((m) => (m ? formatAmountForInput(m) : "")));
  const now: MorningDay = {
    ...day,
    noClass: false,
    full: full.map((f) => (/^\d+$/.test(f) ? Number(f) : 0)) as [number, number, number],
    lessMinor: less.map(typed) as [number, number, number],
  };
  const totals = dayTotals(now);

  return (
    <SchoolForm
      action={action}
      order={MORNING_DAY_FIELDS}
      submitLabel="Save today"
      check={(form) => parseMorningDayForm(formObject(form), todayInAccra())}
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="date" value={day.date} />
          {CLASSES.map((name, i) => (
            <section key={name} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              <Stepper
                name={`full${i + 1}`}
                label={name}
                errors={errors}
                value={full[i]}
                onChange={(value) => setFull(full.map((f, j) => (j === i ? value : f)))}
              />
              <TextField
                name={`less${i + 1}`}
                label="Paid less than 3.00 (total)"
                errors={errors}
                defaultValue={less[i]}
                prefix="GHS"
                inputMode="decimal"
                placeholder="0.00"
                onChange={(value) => setLess(less.map((v, j) => (j === i ? value : v)))}
              />
            </section>
          ))}
          <section className="flex flex-col gap-1 rounded-2xl border bg-card p-4" aria-live="polite">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm">{totals.fullPayers} paid GHS 3.00</span>
              <span className="text-2xl font-extrabold tabular-nums">{money(totals.collectedMinor)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>School ({totals.fullPayers} × 0.50)</span>
              <span className="tabular-nums">{money(totals.schoolMinor)}</span>
            </div>
          </section>
        </>
      )}
    </SchoolForm>
  );
}

export function NoClassForm({ action, date, reason, note }: { action: Action; date: string; reason?: string | null; note?: string }) {
  return (
    <SchoolForm action={action} order={NO_CLASS_FIELDS} submitLabel="Mark as no class" check={(form) => parseNoClassForm(formObject(form))}>
      {({ errors, values }) => (
        <>
          <input type="hidden" name="date" value={date} />
          <Chips
            name="reason"
            legend="Reason"
            errors={errors}
            options={Object.entries(NO_CLASS_REASONS).map(([value, label]) => ({ value, label }))}
            defaultValue={[values.reason ?? reason ?? "holiday"]}
          />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? note ?? ""} placeholder="e.g. Farmers' Day" maxLength={100} />
        </>
      )}
    </SchoolForm>
  );
}

export function SettleForm({
  action,
  days,
  sharers,
  settledOn,
}: {
  action: Action;
  days: MorningDay[];
  sharers: { id: string; name: string }[];
  settledOn: string;
}) {
  const classDays = days.filter((d) => !d.noClass).length;
  const defaults = defaultDeductions(classDays);
  const [markers, setMarkers] = useState(formatAmountForInput(defaults.markersMinor));
  const [assistant, setAssistant] = useState(formatAmountForInput(defaults.assistantMinor));
  const [picked, setPicked] = useState<string[]>(sharers.map((s) => s.id));
  const result = settleWeek({ days, markersMinor: typed(markers), assistantMinor: typed(assistant), sharers: picked.length });

  return (
    <SchoolForm
      action={action}
      order={SETTLE_FIELDS}
      submitLabel="Settle the week"
      check={(form) => parseSettleForm(formObject(form), new FormData(form).getAll("sharers") as string[], todayInAccra())}
    >
      {({ errors }) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Markers
              <input
                name="markers"
                value={markers}
                onChange={(e) => setMarkers(e.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(errors.markers)}
                className="h-12 rounded-xl border bg-transparent px-3 text-base tabular-nums aria-invalid:border-destructive"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Assistant headmistress
              <input
                name="assistant"
                value={assistant}
                onChange={(e) => setAssistant(e.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(errors.assistant)}
                className="h-12 rounded-xl border bg-transparent px-3 text-base tabular-nums aria-invalid:border-destructive"
              />
            </label>
          </div>
          <Chips
            name="sharers"
            legend="Who shares this week"
            errors={errors}
            multiple
            options={sharers.map((s) => ({ value: s.id, label: s.name }))}
            defaultValue={picked}
            onChange={setPicked}
          />
          <TextField name="settledOn" label="Settled on" type="date" errors={errors} defaultValue={settledOn} />

          {result.ok ? (
            <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm" aria-live="polite">
              <Line label="Collected" value={result.value.collectedMinor} strong />
              <Line label="School" value={-result.value.schoolMinor} />
              <Line label="Savings" value={-result.value.savingsMinor} />
              <Line label="Markers" value={-typed(markers)} />
              <Line label="Assistant headmistress" value={-typed(assistant)} />
              <div className="border-t pt-2">
                <Line label={`Each of ${picked.length}`} value={result.value.eachMinor} strong />
              </div>
              <ViewDetails>
                {result.value.savingsRule === "all"
                  ? `${result.value.classDays} class days: all of the last class day (after the school's share) is saved.`
                  : result.value.savingsRule === "half"
                    ? "3 class days: half of the last class day (after the school's share) is saved."
                    : `${result.value.classDays} class days: nothing is saved from the days.`}{" "}
                {result.value.leftoverMinor > 0 ? `${money(result.value.leftoverMinor)} left over from the share is added to savings.` : ""}
              </ViewDetails>
            </section>
          ) : (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm" role="status">
              {result.error}
            </p>
          )}
        </>
      )}
    </SchoolForm>
  );
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={strong ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-bold tabular-nums" : "tabular-nums"}>
        {value < 0 ? "− " : ""}
        {money(Math.abs(value))}
      </span>
    </div>
  );
}

export function SharerForm({ action }: { action: Action }) {
  return (
    <SchoolForm action={action} order={SHARER_FIELDS} submitLabel="Add" resetOnSave check={(form) => parseSharerForm(formObject(form))}>
      {({ errors, values }) => <TextField name="name" label="Name" errors={errors} defaultValue={values.name ?? ""} maxLength={40} placeholder="e.g. Mr Boateng" />}
    </SchoolForm>
  );
}

export function FundSpendForm({ action }: { action: Action }) {
  return (
    <SchoolForm
      action={action}
      order={FUND_SPEND_FIELDS}
      submitLabel="Save"
      resetOnSave
      check={(form) => parseFundSpendForm(formObject(form), todayInAccra())}
    >
      {({ errors, values }) => (
        <>
          <TextField name="amount" label="Amount" errors={errors} defaultValue={values.amount ?? ""} prefix="GHS" inputMode="decimal" placeholder="0.00" />
          <Chips
            name="purpose"
            legend="For"
            errors={errors}
            options={Object.entries(FUND_PURPOSES).map(([value, label]) => ({ value, label }))}
            defaultValue={values.purpose ? [values.purpose] : []}
          />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? ""} placeholder="e.g. Sports day" maxLength={100} />
          <TextField name="spentOn" label="Date" type="date" errors={errors} defaultValue={values.spentOn ?? todayInAccra()} />
        </>
      )}
    </SchoolForm>
  );
}

// --- Fees ------------------------------------------------------------------

export function FeeForm({ action, initial, submitLabel }: { action: Action; initial?: { name: string; amount: string }; submitLabel: string }) {
  return (
    <SchoolForm action={action} order={FEE_FIELDS} submitLabel={submitLabel} check={(form) => parseFeeForm(formObject(form))}>
      {({ errors, values }) => (
        <>
          <TextField name="name" label="Name" errors={errors} defaultValue={values.name ?? initial?.name ?? ""} maxLength={60} placeholder="e.g. Mock 1 fees" />
          <TextField
            name="amount"
            label="Amount per student"
            errors={errors}
            defaultValue={values.amount ?? initial?.amount ?? ""}
            prefix="GHS"
            inputMode="decimal"
            placeholder="0.00"
            details="Each student added to this fee pays this, unless you change it for them (0 is a full discount)."
          />
        </>
      )}
    </SchoolForm>
  );
}

export function StudentsForm({ action }: { action: Action }) {
  return (
    <SchoolForm action={action} order={STUDENTS_FIELDS} submitLabel="Add students" check={(form) => parseStudentsForm(formObject(form))}>
      {({ errors }) => (
        <>
          <TextArea name="names" label="Names, one per line" errors={errors} placeholder={"Ama Owusu\nKofi Asante"} details="A name already on the fee is skipped." />
          <TextField name="className" label="Class (optional)" errors={errors} maxLength={20} placeholder="e.g. JHS 3" />
        </>
      )}
    </SchoolForm>
  );
}

export function PaymentForm({
  action,
  students,
  amountLabel = "Amount paid now",
  allowZero = false,
  subjects,
  defaultStudent = "",
}: {
  action: Action;
  students: { id: string; label: string }[];
  amountLabel?: string;
  allowZero?: boolean;
  subjects?: { id: string; label: string }[];
  defaultStudent?: string;
}) {
  const [studentId, setStudentId] = useState(defaultStudent || (students.length === 0 ? "new" : ""));
  return (
    <SchoolForm
      action={action}
      order={[...PAYMENT_FIELDS, "subjects"]}
      submitLabel="Save payment"
      resetOnSave
      check={(form) => parsePaymentForm(formObject(form), todayInAccra(), { allowZero })}
    >
      {({ errors, values }) => (
        <>
          <SelectField
            name="studentId"
            label="Student"
            errors={errors}
            defaultValue={values.studentId ?? studentId}
            onChange={setStudentId}
            placeholder="Choose a student"
            options={[...students.map((s) => ({ value: s.id, label: s.label })), { value: "new", label: "+ New student" }]}
          />
          {studentId === "new" ? (
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <TextField name="newName" label="Name" errors={errors} defaultValue={values.newName ?? ""} maxLength={80} />
              <TextField name="newClass" label="Class" errors={errors} defaultValue={values.newClass ?? ""} maxLength={20} placeholder="JHS 3" />
            </div>
          ) : null}
          {subjects && subjects.length > 0 ? (
            <Chips name="subjects" legend="Books they want (optional)" errors={errors} multiple options={subjects.map((s) => ({ value: s.id, label: s.label }))} />
          ) : null}
          <TextField
            name="amount"
            label={amountLabel}
            errors={errors}
            defaultValue={values.amount ?? ""}
            prefix="GHS"
            inputMode="decimal"
            placeholder="0.00"
          />
          <TextField name="paidOn" label="Date" type="date" errors={errors} defaultValue={values.paidOn ?? todayInAccra()} />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? ""} maxLength={100} />
        </>
      )}
    </SchoolForm>
  );
}

export function PayableForm({ action, payable }: { action: Action; payable: string }) {
  return (
    <SchoolForm action={action} order={PAYABLE_FIELDS} submitLabel="Save" check={(form) => parsePayableForm(formObject(form))}>
      {({ errors, values }) => (
        <TextField
          name="payable"
          label="What this student pays"
          errors={errors}
          defaultValue={values.payable ?? payable}
          prefix="GHS"
          inputMode="decimal"
          details="0 is a full discount: the student pays nothing."
        />
      )}
    </SchoolForm>
  );
}

export function HandoverForm({ action, holdingMinor }: { action: Action; holdingMinor: number }) {
  return (
    <SchoolForm action={action} order={HANDOVER_FIELDS} submitLabel="Hand over" check={(form) => parseHandoverForm(formObject(form), todayInAccra())}>
      {({ errors, values }) => (
        <>
          <Chips
            name="toWhom"
            legend="To"
            errors={errors}
            options={Object.entries(RECIPIENTS).map(([value, label]) => ({ value, label }))}
            defaultValue={[values.toWhom ?? "headmaster"]}
          />
          <TextField
            name="amount"
            label="Amount"
            errors={errors}
            defaultValue={values.amount ?? formatAmountForInput(holdingMinor)}
            prefix="GHS"
            inputMode="decimal"
            details={`You are holding ${money(holdingMinor)}. Change the amount to hand over only part. Handed to Myself, it becomes your income.`}
          />
          <TextField name="handedOn" label="Date" type="date" errors={errors} defaultValue={values.handedOn ?? todayInAccra()} />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? ""} placeholder="e.g. Signed by the headmaster" maxLength={100} />
        </>
      )}
    </SchoolForm>
  );
}

export function MyPartForm({ action }: { action: Action }) {
  return (
    <SchoolForm action={action} order={MY_PART_FIELDS} submitLabel="Add to my income" check={(form) => parseMyPartForm(formObject(form), todayInAccra())}>
      {({ errors, values }) => (
        <>
          <TextField
            name="amount"
            label="Amount you kept"
            errors={errors}
            defaultValue={values.amount ?? ""}
            prefix="GHS"
            inputMode="decimal"
            placeholder="0.00"
            details="Saved as income in the School money category, into your school money account."
          />
          <TextField name="receivedOn" label="Date" type="date" errors={errors} defaultValue={values.receivedOn ?? todayInAccra()} />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? ""} maxLength={100} />
        </>
      )}
    </SchoolForm>
  );
}

// --- Books -----------------------------------------------------------------

export function SubjectForm({ action, initial, submitLabel }: { action: Action; initial?: { name: string; price: string }; submitLabel: string }) {
  return (
    <SchoolForm action={action} order={SUBJECT_FIELDS} submitLabel={submitLabel} resetOnSave={!initial} check={(form) => parseSubjectForm(formObject(form))}>
      {({ errors, values }) => (
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <TextField name="name" label="Subject" errors={errors} defaultValue={values.name ?? initial?.name ?? ""} maxLength={40} />
          <TextField name="price" label="Price" errors={errors} defaultValue={values.price ?? initial?.price ?? "80.00"} prefix="GHS" inputMode="decimal" />
        </div>
      )}
    </SchoolForm>
  );
}

export function BookSplitForm({ action, transport, mine }: { action: Action; transport: string; mine: string }) {
  return (
    <SchoolForm action={action} order={BOOK_SPLIT_FIELDS} submitLabel="Save" check={(form) => parseBookSplitForm(formObject(form))}>
      {({ errors, values }) => (
        <div className="grid grid-cols-2 gap-3">
          <TextField name="transport" label="Transport per book" errors={errors} defaultValue={values.transport ?? transport} prefix="GHS" inputMode="decimal" />
          <TextField name="mine" label="Mine per book" errors={errors} defaultValue={values.mine ?? mine} prefix="GHS" inputMode="decimal" />
        </div>
      )}
    </SchoolForm>
  );
}

export function PurchaseForm({ action, subjects }: { action: Action; subjects: { id: string; name: string }[] }) {
  return (
    <SchoolForm action={action} order={PURCHASE_FIELDS} submitLabel="Save" resetOnSave check={(form) => parsePurchaseForm(formObject(form), todayInAccra())}>
      {({ errors, values }) => (
        <>
          <Chips
            name="subjectId"
            legend="Subject"
            errors={errors}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            defaultValue={values.subjectId ? [values.subjectId] : []}
          />
          <TextField name="quantity" label="How many" errors={errors} defaultValue={values.quantity ?? ""} inputMode="numeric" placeholder="e.g. 20" />
          <TextField name="amount" label="Amount you paid (all of them)" errors={errors} defaultValue={values.amount ?? ""} prefix="GHS" inputMode="decimal" placeholder="0.00" />
          <TextField name="boughtOn" label="Date" type="date" errors={errors} defaultValue={values.boughtOn ?? todayInAccra()} />
          <TextField name="note" label="Note (optional)" errors={errors} defaultValue={values.note ?? ""} maxLength={100} />
        </>
      )}
    </SchoolForm>
  );
}

export function GiveOutForm({ action, books }: { action: Action; books: { id: string; label: string; disabled: string | null }[] }) {
  const available = books.filter((b) => !b.disabled);
  return (
    <SchoolForm
      action={action}
      order={["orders", "givenOn"]}
      submitLabel="Give out"
      check={(form) =>
        new FormData(form).getAll("orders").length > 0 ? { ok: true } : { ok: false, errors: { orders: "Tick the books you are giving out." } }
      }
    >
      {({ errors, values }) => (
        <>
          <Chips
            name="orders"
            legend="Books to give out now"
            errors={errors}
            multiple
            options={available.map((b) => ({ value: b.id, label: b.label }))}
            defaultValue={available.map((b) => b.id)}
          />
          {books
            .filter((b) => b.disabled)
            .map((b) => (
              <p key={b.id} className="text-sm text-muted-foreground">
                {b.label}: {b.disabled}
              </p>
            ))}
          <TextField name="givenOn" label="Date" type="date" errors={errors} defaultValue={values.givenOn ?? todayInAccra()} />
        </>
      )}
    </SchoolForm>
  );
}
