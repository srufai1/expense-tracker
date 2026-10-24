import { connection, type NextRequest } from "next/server";

import { appConfig } from "@/config/app";
import { todayInAccra } from "@/lib/dates";
import { reportPdfModel } from "@/lib/pdf/model";
import { renderReportPdf } from "@/lib/pdf/report-document";
import { downloadName, parseReportParams, periodTitle } from "@/lib/reports/params";

import { getReport } from "../../(app)/reports/data";

// "Download PDF" (D-20, screen 10): the report on screen, as a real PDF
// file. Same address parameters as /reports. getReport() checks the
// session, so a signed-out visitor is sent to sign in.
export async function GET(request: NextRequest) {
  await connection();
  const today = todayInAccra();
  const { period, error } = parseReportParams(Object.fromEntries(request.nextUrl.searchParams), today);
  if (error) return new Response(error, { status: 400 });

  const report = await getReport(period, today);
  const pdf = await renderReportPdf(reportPdfModel(report, { title: periodTitle(period), today, appName: appConfig.name }));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadName(period, "pdf")}"`,
      // Private money data: never kept by a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
