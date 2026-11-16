// ===========================================
// CTRL-03 / CTRL-03r: ลายนิ้วมือยอดงวด (detective control)
//   ข้อมูลธุรกิจอยู่ในชีตของลูกค้า แก้ในชีตตรง ๆ ได้โดยไม่ผ่านด่านปิดงวด
//   → ตอนปิดเก็บยอดรวมต่อเดือน: ภาษีขาย/ซื้อ/หัก ณ ที่จ่าย (รายงานที่ยื่น) + รายได้/ค่าใช้จ่ายที่ปิดงวดล็อกไว้
//   → เทียบใหม่: หน้า ภ.พ.30/ภ.ง.ด. ของเดือนปิด, ปุ่มตรวจในตั้งค่า, cron รายเดือนแจ้งเจ้าของทาง LINE
// ใช้รายงาน/รายการตัวเดียวกับที่ผู้ใช้เห็น ในมุมมองทั้งองค์กร (role admin → ไม่กรองโครงการ)
// ===========================================

import { createCallerFactory, type TRPCContext } from "../trpc";
import { reportRouter } from "../routers/report.router";
import { getSheetsService, ensureTabsCached } from "./sheets-context";
import { SHEET_TABS } from "../services/google-sheets.service";
import {
  lockedMonthTotals,
  periodTotalsDiffs,
  thaiPeriodLabel,
  type PeriodCloseSettings,
  type PeriodTotals,
} from "@/lib/period-close";

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

/**
 * ยอดรวมต่อเดือน (ทั้งองค์กร) — เดือนที่คำนวณไม่ได้ (อ่านชีตล้ม) จะไม่มีในผลลัพธ์
 * ภาษี: รายงานตัวเดียวกับที่ผู้ใช้เห็น · รายได้/ค่าใช้จ่าย: lockedMonthTotals (เฉพาะสิ่งที่ปิดงวดล็อกไว้)
 */
export async function computePeriodTotals(ctx: TRPCContext, months: string[]): Promise<Record<string, PeriodTotals>> {
  if (!ctx.org || months.length === 0) return {};
  const adminCtx: TRPCContext = { ...ctx, org: { ...ctx.org, role: "admin" } };
  const report = createCallerFactory(reportRouter)(adminCtx);
  const out: Record<string, PeriodTotals> = {};
  const at = new Date().toISOString();

  // ข้อมูลดิบอ่านครั้งเดียว (cache แท็บเดียวกับรายงาน) แล้วคิดทีละเดือน
  let locked: ((month: string) => { revenue: number; expense: number }) | null = null;
  try {
    const sheets = await getSheetsService(ctx.org.orgId);
    await ensureTabsCached(sheets, ctx.org.orgId);
    const [payments, batch] = await Promise.all([
      sheets.getPayments(),
      sheets.getAllBatch([SHEET_TABS.BILLINGS, SHEET_TABS.TAX_INVOICES, SHEET_TABS.CREDIT_NOTES, SHEET_TABS.PURCHASE_NOTES]),
    ]);
    const data = {
      payments,
      billings: batch[SHEET_TABS.BILLINGS] || [],
      taxInvoices: batch[SHEET_TABS.TAX_INVOICES] || [],
      creditNotes: batch[SHEET_TABS.CREDIT_NOTES] || [],
      purchaseNotes: batch[SHEET_TABS.PURCHASE_NOTES] || [],
    };
    locked = (month) => lockedMonthTotals(data, month);
  } catch (err) {
    console.error("[period-fingerprint] revenue/expense data failed — tax totals only", err);
  }

  for (const ym of months) {
    try {
      const range = monthBounds(ym);
      const [vat, wht] = await Promise.all([report.vat30(range), report.wht(range)]);
      out[ym] = {
        outputVat: vat.output.totalVAT,
        inputVat: vat.input.totalVAT,
        wht: wht.stats.totalWHT,
        ...(locked ? locked(ym) : {}),
        at,
      };
    } catch (err) {
      console.error(`[period-fingerprint] ${ym} failed — no fingerprint for this month`, err);
    }
  }
  return out;
}

export type PeriodMismatch = { month: string; label: string; diffs: string[] };

/** เทียบยอดปัจจุบันกับลายนิ้วมือ → เดือนที่ไม่ตรง (ข้ามเดือนที่คำนวณไม่ได้) */
export async function verifyClosedPeriods(
  ctx: TRPCContext,
  settings: PeriodCloseSettings,
  months: string[],
): Promise<{ checked: string[]; mismatches: PeriodMismatch[] }> {
  const current = await computePeriodTotals(ctx, months);
  const mismatches: PeriodMismatch[] = [];
  const checked: string[] = [];
  for (const ym of months) {
    const snap = settings.snapshots?.[ym];
    const cur = current[ym];
    if (!snap || !cur) continue;
    checked.push(ym);
    const diffs = periodTotalsDiffs(snap, cur);
    if (diffs.length > 0) mismatches.push({ month: ym, label: thaiPeriodLabel(ym), diffs });
  }
  return { checked, mismatches };
}
