// ===========================================
// CTRL-03 / CTRL-03r: ลายนิ้วมือยอดงวด (detective control)
//   ข้อมูลธุรกิจอยู่ในชีตของลูกค้า แก้ในชีตตรง ๆ ได้โดยไม่ผ่านด่านปิดงวด
//   → ตอนปิดเก็บยอดรวมต่อเดือน: ภาษีขาย/ซื้อ/หัก ณ ที่จ่าย (รายงานที่ยื่น) + รายได้/ค่าใช้จ่ายรวม (ตาม Dashboard)
//   → เทียบใหม่: หน้า ภ.พ.30/ภ.ง.ด. ของเดือนปิด, ปุ่มตรวจในตั้งค่า, cron รายเดือนแจ้งเจ้าของทาง LINE
// ใช้รายงาน/รายการตัวเดียวกับที่ผู้ใช้เห็น ในมุมมองทั้งองค์กร (role admin → ไม่กรองโครงการ)
// ===========================================

import { createCallerFactory, type TRPCContext } from "../trpc";
import { reportRouter } from "../routers/report.router";
import { paymentRouter } from "../routers/payment.router";
import { billingRouter } from "../routers/billing.router";
import { taxInvoiceRouter } from "../routers/taxInvoice.router";
import { creditNoteRouter } from "../routers/creditNote.router";
import { purchaseNoteRouter } from "../routers/purchaseNote.router";
import { computeDashboardPL } from "@/lib/dashboard-pl";
import { periodTotalsDiffs, thaiPeriodLabel, type PeriodCloseSettings, type PeriodTotals } from "@/lib/period-close";

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

/** ข้อมูลเอกสารขาย — แพ็กเกจที่ไม่มีโมดูลรายได้ → ว่าง (เหมือน Dashboard) */
async function orEmpty<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

/**
 * ยอดรวมต่อเดือน (ทั้งองค์กร) — เดือนที่คำนวณไม่ได้ (อ่านชีตล้ม) จะไม่มีในผลลัพธ์
 * vatRegistered: ตามตั้งค่าองค์กร (ต้นทุนรวม/ไม่รวม VAT ที่ขอคืนได้ — เหมือน Dashboard)
 */
export async function computePeriodTotals(
  ctx: TRPCContext,
  months: string[],
  vatRegistered: boolean,
): Promise<Record<string, PeriodTotals>> {
  if (!ctx.org || months.length === 0) return {};
  const adminCtx: TRPCContext = { ...ctx, org: { ...ctx.org, role: "admin" } };
  const report = createCallerFactory(reportRouter)(adminCtx);
  const out: Record<string, PeriodTotals> = {};
  const at = new Date().toISOString();

  // รายได้/ค่าใช้จ่าย: อ่านครั้งเดียว แล้วคิดทีละเดือนด้วยฟังก์ชันเดียวกับ Dashboard
  let pl: ((month: string) => { revenue: number; expense: number }) | null = null;
  try {
    const [payments, billings, taxInvoices, notes, purchaseNotes] = await Promise.all([
      createCallerFactory(paymentRouter)(adminCtx).list(),
      orEmpty(createCallerFactory(billingRouter)(adminCtx).list()),
      orEmpty(createCallerFactory(taxInvoiceRouter)(adminCtx).list()),
      orEmpty(createCallerFactory(creditNoteRouter)(adminCtx).list()),
      createCallerFactory(purchaseNoteRouter)(adminCtx).list(),
    ]);
    pl = (month) => {
      const r = computeDashboardPL({ payments, billings, taxInvoices, notes, purchaseNotes, month, eventId: "all", vatRegistered });
      return { revenue: r.revenue, expense: r.expense };
    };
  } catch (err) {
    console.error("[period-fingerprint] P&L data failed — tax totals only", err);
  }

  for (const ym of months) {
    try {
      const range = monthBounds(ym);
      const [vat, wht] = await Promise.all([report.vat30(range), report.wht(range)]);
      out[ym] = {
        outputVat: vat.output.totalVAT,
        inputVat: vat.input.totalVAT,
        wht: wht.stats.totalWHT,
        ...(pl ? pl(ym) : {}),
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
  vatRegistered: boolean,
): Promise<{ checked: string[]; mismatches: PeriodMismatch[] }> {
  const current = await computePeriodTotals(ctx, months, vatRegistered);
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
