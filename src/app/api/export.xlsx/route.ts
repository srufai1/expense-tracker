import { connection, type NextRequest } from "next/server";

import { todayInAccra } from "@/lib/dates";
import { everythingSheets, reportSheets } from "@/lib/export/sheets";
import { toXlsx } from "@/lib/export/workbook";
import { downloadName, parseReportParams, periodTitle } from "@/lib/reports/params";

import { getBackupData, getExportTransactions } from "../../(app)/reports/export-data";
import { getReport } from "../../(app)/reports/data";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel downloads (D-20):
// - ?period=…  the report's numbers and that period's transactions
//              (Reports, and the month on Activity);
// - ?scope=all everything, the backup ("Export everything" on More).
// The loaders check the session, so a signed-out visitor is sent to sign in.
export async function GET(request: NextRequest) {
  await connection();
  const today = todayInAccra();
  const params = Object.fromEntries(request.nextUrl.searchParams);

  if (params.scope === "all") {
    const file = await toXlsx(everythingSheets(await getBackupData()));
    return download(file, `expense-tracker-backup-${today}.xlsx`);
  }

  const { period, error } = parseReportParams(params, today);
  if (error) return new Response(error, { status: 400 });
  const [report, transactions] = await Promise.all([getReport(period, today), getExportTransactions(period)]);
  const file = await toXlsx(reportSheets(report, transactions, periodTitle(period)));
  return download(file, downloadName(period, "xlsx"));
}

function download(file: Buffer, name: string) {
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
