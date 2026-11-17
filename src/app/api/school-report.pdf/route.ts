import { createElement } from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { connection, type NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { formatDate, todayInAccra } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { feeTotals, NO_CLASS_REASONS, RECIPIENTS } from "@/lib/school/fees";
import { CLASSES, dayTotals } from "@/lib/school/morning";
import { schoolWeekDays, weekFromParam } from "@/lib/school/week";

import { getFee, getMorningWeek } from "../../(app)/school/data";

type Section = { heading: string; lines: string[] };
const ghs = (amount: number) => formatMoney(amount, "GHS");

export async function GET(request: NextRequest) {
  await connection();
  await requireUser();
  const feeId = request.nextUrl.searchParams.get("fee");
  const sections: Section[] = [];
  let title: string;
  let filename: string;

  if (feeId !== null) {
    if (!z.uuid().safeParse(feeId).success) return new Response("Invalid fee", { status: 400 });
    const fee = await getFee(feeId);
    if (!fee) return new Response("Fee not found", { status: 404 });
    title = fee.name + " payment statement";
    filename = "fee-payment-statement.pdf";
    const totals = feeTotals(fee.students);
    const handedOver = fee.handovers.reduce((sum, entry) => sum + entry.amountMinor, 0);
    sections.push({ heading: "Summary", lines: [
      `Collected ${ghs(totals.collectedMinor)} · Outstanding ${ghs(totals.stillToPayMinor)}`,
      `Handed over ${ghs(handedOver)} · Held ${ghs(totals.collectedMinor - handedOver)}`,
    ] });
    for (const student of fee.students) {
      sections.push({
        heading: [student.name, student.className].filter(Boolean).join(" · "),
        lines: [
          `Due ${ghs(student.payableMinor)} · Paid ${ghs(student.paidMinor)} · Balance ${ghs(Math.max(0, student.payableMinor - student.paidMinor))}`,
          ...student.payments.map((p) => [formatDate(p.paidOn), ghs(p.amountMinor), p.note].filter(Boolean).join(" · ")),
        ],
      });
    }
    if (fee.handovers.length) sections.push({
      heading: "Hand-overs",
      lines: fee.handovers.map((h) => [formatDate(h.handedOn), RECIPIENTS[h.toWhom], ghs(h.amountMinor), h.note].filter(Boolean).join(" · ")),
    });
  } else {
    const monday = weekFromParam(request.nextUrl.searchParams.get("week") ?? undefined, todayInAccra());
    const friday = schoolWeekDays(monday)[4];
    const { days, week } = await getMorningWeek(monday, friday);
    title = `Morning classes · ${formatDate(monday)} to ${formatDate(friday)}`;
    filename = `morning-classes-${monday}.pdf`;
    const collections = days.reduce((sum, day) => sum + dayTotals(day).collectedMinor, 0);
    sections.push({ heading: "Weekly collections", lines: [`Total collected ${ghs(collections)}`] });
    for (const day of days) {
      const totals = dayTotals(day);
      sections.push({
        heading: formatDate(day.date),
        lines: day.noClass
          ? [NO_CLASS_REASONS[day.reason ?? "other"], day.note].filter(Boolean)
          : [
            ...CLASSES.map((name, i) => `${name} · ${ghs(day.full[i] * day.feeMinor + day.lessMinor[i])} · ${day.full[i]} full payments`),
            `Total ${ghs(totals.collectedMinor)} · School share ${ghs(totals.schoolMinor)}`,
          ],
      });
    }
    sections.push({
      heading: "Sharing and savings",
      lines: week ? [
        `Settled ${formatDate(week.settledOn)} · School share ${ghs(week.schoolMinor)}`,
        `Savings ${ghs(week.savingsMinor)} · Markers ${ghs(week.markersMinor)} · Assistant headmistress ${ghs(week.assistantMinor)}`,
        ...week.shares.map((s) => `${s.name} · ${ghs(s.amountMinor)} · ${s.paidOn ? formatDate(s.paidOn) : "Unpaid"}`),
      ] : ["This week has not been settled."],
    });
  }

  const pdf = await renderToBuffer(createElement(Document, { title },
    createElement(Page, { size: "A4", style: { padding: 38, fontSize: 10, lineHeight: 1.45 } },
      createElement(Text, { style: { fontSize: 18, marginBottom: 16 } }, title),
      ...sections.map(({ heading, lines }, index) => createElement(View, { key: index, style: { marginBottom: 12 } },
        createElement(Text, { minPresenceAhead: 18, style: { fontFamily: "Helvetica-Bold" } }, heading),
        ...lines.map((line, i) => createElement(Text, { key: i }, line)),
      )),
    ),
  ));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
