// ===========================================
// CTRL-01: ปิดงวดบัญชี (Pim 16/11/2569: "ให้ user กำหนดสิทธิ์ได้ · default เป็นเจ้าของก่อน")
//
// ปิดงวดถึงเดือน X = เอกสาร/รายการที่ลงงวดเดือน ≤ X แก้/ยกเลิก/ออกใหม่ไม่ได้ (รายงาน ภ.พ.30 / ภ.ง.ด.
// ที่ยื่นแล้วต้องไม่เปลี่ยนเงียบ ๆ — พ.ร.บ.การบัญชี) · ต้องแก้จริง → ผู้มีสิทธิ์เปิดงวดก่อน (มี audit log)
// เก็บใน organization.settings (ค่าตั้งค่า ไม่ใช่ข้อมูลธุรกิจ — Zero Data Retention)
// ===========================================

import { whtPeriodDate } from "./wht-doc-utils";

export type PeriodCloseSettings = {
  /** เดือนล่าสุดที่ปิดแล้ว (YYYY-MM) · "" = ยังไม่เคยปิด */
  closedThrough: string;
  /** ผู้มีสิทธิ์ปิด/เปิดงวด + มอบสิทธิ์ (เจ้าขององค์กรมีเสมอ) */
  managers: string[];
  /** CTRL-03: ยอดรวมของแต่ละเดือน ณ ตอนปิดงวด (ลายนิ้วมือ) — ใช้ตรวจว่ามีการแก้ข้อมูลในชีตนอกระบบ */
  snapshots?: Record<string, PeriodTotals>;
};

/** CTRL-03: ยอดรวมของงวด (ทั้งองค์กร) */
export type PeriodTotals = { outputVat: number; inputVat: number; wht: number; at?: string };

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readPeriodClose(settings: unknown): PeriodCloseSettings {
  const raw =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? ((settings as Record<string, unknown>).periodClose as Record<string, unknown> | undefined)
      : undefined;
  const closedThrough = typeof raw?.closedThrough === "string" && YM.test(raw.closedThrough) ? raw.closedThrough : "";
  const managers = Array.isArray(raw?.managers) ? (raw!.managers as unknown[]).filter((v): v is string => typeof v === "string") : [];
  const snapshots: Record<string, PeriodTotals> = {};
  const rawSnaps = raw?.snapshots;
  if (rawSnaps && typeof rawSnaps === "object" && !Array.isArray(rawSnaps)) {
    for (const [ym, v] of Object.entries(rawSnaps as Record<string, unknown>)) {
      if (!YM.test(ym) || !v || typeof v !== "object") continue;
      const t = v as Record<string, unknown>;
      const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
      snapshots[ym] = { outputVat: n(t.outputVat), inputVat: n(t.inputVat), wht: n(t.wht), ...(typeof t.at === "string" ? { at: t.at } : {}) };
    }
  }
  return Object.keys(snapshots).length > 0 ? { closedThrough, managers, snapshots } : { closedThrough, managers };
}

/** วันที่ (YYYY-MM-DD) อยู่ในงวดที่ปิดแล้วไหม */
export function isDateInClosedPeriod(date: string | undefined | null, closedThrough: string): boolean {
  if (!closedThrough || !date) return false;
  const ym = String(date).slice(0, 7);
  return YM.test(ym) && ym <= closedThrough;
}

/** เจ้าของ หรือคนที่ได้รับมอบสิทธิ์ */
export function canManagePeriod(userId: string, ownerId: string | null | undefined, settings: PeriodCloseSettings): boolean {
  return userId === ownerId || settings.managers.includes(userId);
}

/** เดือนก่อนหน้า (YYYY-MM) */
export function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiPeriodLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m >= 1 && m <= 12 ? `${THAI_MONTHS[m - 1]} ${y + 543}` : ym;
}

type PaymentRow = Record<string, string | undefined>;
const SETTLED = new Set(["paid", "cleared"]);

/**
 * CTRL-04c: รายการที่ "จะเป็นจ่ายแล้วเมื่ออนุมัติ/ปฏิเสธ" (บันทึกจ่ายแล้วโดยผู้ไม่มีสิทธิ์อนุมัติ หรือแก้หลังจ่าย)
 * ที่ลงงวด ≤ month — ปิดงวดก่อนจัดการรายการเหล่านี้ = อนุมัติ/ปฏิเสธไม่ได้จนกว่าจะเปิดงวด
 */
export function pendingSettlementsInPeriod<T extends PaymentRow>(rows: T[], month: string): T[] {
  return rows.filter((r) => {
    if (r.Status !== "pending") return false;
    const next = r.ReapprovalOf || r.ApproveTo || "";
    if (!SETTLED.has(next)) return false;
    return paymentReportDates({ ...r, Status: next }).some((d) => isDateInClosedPeriod(d, month));
  });
}

/**
 * วันที่ที่รายการจ่ายถูกนับในรายงาน (ภาษีซื้อ / ภ.ง.ด.) — ใช้ตรวจปิดงวด
 * เฉพาะรายการที่จ่ายแล้ว (pending/approved ยังไม่อยู่ในรายงาน → แก้ได้)
 */
export function paymentReportDates(p: PaymentRow): string[] {
  if (!SETTLED.has(p.Status || "")) return [];
  const dates = [
    // PUR-08: มีเดือนใช้สิทธิ์ = วันที่ใบไม่ได้กำหนดงวดรายงานแล้ว (ใบรายการจ่ายใช้ ReceiptDate เฉพาะรายงานภาษีซื้อ)
    p.VatClaimMonth ? "" : p.ReceiptDate,
    p.PaymentDate,
    (p.PaidAt || "").slice(0, 10),
    p.VatClaimMonth ? `${p.VatClaimMonth}-01` : "", // PUR-08: งวดที่ใช้สิทธิ์ภาษีซื้อ
    // TAX-01: งวด ภ.ง.ด. + วันที่บน 50 ทวิ (อาจเป็นวันที่ใบเสร็จ สำหรับ "บันทึกค่าใช้จ่าย" รุ่นเก่า) — ตรวจเสมอ
    (parseFloat(p.WTHAmount || "") || 0) > 0 ? whtPeriodDate(p) : "",
  ].filter((d): d is string => !!d);
  return Array.from(new Set(dates.map((d) => d.slice(0, 10))));
}

/**
 * PUR-09b: เลขผู้เสียภาษีผู้รับเงินในรายงาน — งวดที่ปิดแล้วใช้ค่าที่บันทึกไว้ตอนจ่าย (รายงานที่ยื่นแล้วต้องไม่เปลี่ยน)
 * · งวดที่ยังเปิดใช้ทะเบียนปัจจุบัน (แก้เลขที่พิมพ์ผิดในทะเบียนแล้ว ภ.ง.ด. ที่ยังไม่ยื่นต้องถูกตาม)
 */
export function vendorTaxIdFor(
  snapshot: string | undefined,
  registry: string | undefined,
  reportDate: string | undefined,
  closedThrough: string,
): string {
  return isDateInClosedPeriod(reportDate, closedThrough)
    ? snapshot || registry || ""
    : registry || snapshot || "";
}

const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * PUR-08: เดือนที่ใช้สิทธิ์ภาษีซื้อของรายการที่เพิ่งจ่าย
 * เดือนของใบกำกับยังเปิด → "" (ลงเดือนของใบตามเดิม) · ปิดแล้ว (ยื่นไปแล้ว) → เดือนแรกที่ยังเปิด ไม่ก่อนเดือนที่จ่าย
 * เกิน 6 เดือนนับจากเดือนของใบ (ม.82/3) → lateClaim = ขอคืนไม่ได้
 */
export function vatClaimMonthFor(
  invoiceDate: string | undefined,
  settleDate: string,
  closedThrough: string,
): { claimMonth: string; lateClaim: boolean } {
  const invoiceMonth = (invoiceDate || settleDate || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(invoiceMonth) || !isDateInClosedPeriod(`${invoiceMonth}-01`, closedThrough)) {
    return { claimMonth: "", lateClaim: false };
  }
  const firstOpen = nextMonth(closedThrough);
  const settleMonth = settleDate.slice(0, 7);
  const claimMonth = settleMonth > firstOpen ? settleMonth : firstOpen;
  return { claimMonth, lateClaim: monthIndex(claimMonth) - monthIndex(invoiceMonth) > 6 };
}

/** PUR-08: ตั้ง/ล้างเหตุ "เกิน 6 เดือน" — ไม่ทับเหตุต้องห้ามอื่นที่ผู้ใช้เลือกไว้ */
export function lateClaimPatch(
  row: { DocumentType?: string; NonDeductibleVat?: string },
  lateClaim: boolean,
): { NonDeductibleVat?: string } {
  const cur = row.NonDeductibleVat || "";
  if (lateClaim && row.DocumentType === "tax_invoice" && !cur) return { NonDeductibleVat: "late_claim" };
  if (!lateClaim && cur === "late_claim") return { NonDeductibleVat: "" };
  return {};
}

/** PUR-08: วันที่ที่ใช้จัดงวดภาษีซื้อ (กรองรายงาน ภ.พ.30) — มีเดือนใช้สิทธิ์ = วันแรกของเดือนนั้น */
export function inputVatPeriodDate(row: { VatClaimMonth?: string }, invoiceDate: string): string {
  return row.VatClaimMonth && /^\d{4}-\d{2}$/.test(row.VatClaimMonth) ? `${row.VatClaimMonth}-01` : invoiceDate;
}

// ===========================================
// CTRL-03: ลายนิ้วมือยอดงวดตอนปิด (detective control)
//   ข้อมูลธุรกิจอยู่ในชีตของลูกค้า — แก้ในชีตตรง ๆ ได้โดยไม่ผ่านด่านปิดงวด
//   → เก็บยอดรวมตอนปิด แล้วรายงานของเดือนที่ปิดแล้วเทียบให้ ถ้าไม่ตรง = มีการแก้ข้อมูลหลังปิดงวด
// ===========================================

/** เดือนที่ปิดเพิ่มในรอบนี้ (หลัง prevClosed ถึง month) — เก็บแค่ cap เดือนล่าสุด */
export function monthsToSnapshot(prevClosed: string, month: string, cap = 12): string[] {
  if (!YM.test(month)) return [];
  const out: string[] = [];
  let m = month;
  while (out.length < cap && (!prevClosed || m > prevClosed) && m >= "2000-01") {
    out.unshift(m);
    m = prevMonth(m);
  }
  return out;
}

/** รวม snapshot ใหม่ · เก็บแค่ keep เดือนล่าสุด (กันคอลัมน์ settings โตไม่รู้จบ) */
export function mergeSnapshots(
  existing: Record<string, PeriodTotals> | undefined,
  added: Record<string, PeriodTotals>,
  keep = 24,
): Record<string, PeriodTotals> {
  const all = { ...(existing || {}), ...added };
  const months = Object.keys(all).sort().slice(-keep);
  return Object.fromEntries(months.map((m) => [m, all[m]]));
}

/** เปิดงวดตั้งแต่ month → ลบลายนิ้วมือของเดือนนั้นเป็นต้นไป (ปิดใหม่จะเก็บยอดใหม่) */
export function dropSnapshotsFrom(
  existing: Record<string, PeriodTotals> | undefined,
  month: string,
): Record<string, PeriodTotals> {
  return Object.fromEntries(Object.entries(existing || {}).filter(([m]) => m < month));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ยอดที่ไม่ตรงกับตอนปิดงวด (ต่างเกิน 0.01) → รายการข้อความ · [] = ตรง */
export function periodTotalsDiffs(
  snapshot: PeriodTotals,
  current: Partial<Pick<PeriodTotals, "outputVat" | "inputVat" | "wht">>,
): string[] {
  const labels: Record<"outputVat" | "inputVat" | "wht", string> = {
    outputVat: "ภาษีขาย",
    inputVat: "ภาษีซื้อ",
    wht: "ภาษีหัก ณ ที่จ่าย",
  };
  const diffs: string[] = [];
  for (const k of ["outputVat", "inputVat", "wht"] as const) {
    const cur = current[k];
    if (cur === undefined) continue;
    if (Math.abs(round2(cur) - round2(snapshot[k])) > 0.01) {
      diffs.push(`${labels[k]} ตอนปิด ${round2(snapshot[k]).toFixed(2)} → ตอนนี้ ${round2(cur).toFixed(2)}`);
    }
  }
  return diffs;
}

/** รายงานช่วงนี้ = เดือนเดียวเต็มเดือนที่ปิดแล้วและมีลายนิ้วมือไหม → คืนเดือน (YYYY-MM) */
export function singleClosedMonth(from: string, to: string, settings: PeriodCloseSettings): string {
  const ym = from.slice(0, 7);
  if (to.slice(0, 7) !== ym || from.slice(8, 10) !== "01") return "";
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (Number(to.slice(8, 10)) !== lastDay) return "";
  if (!isDateInClosedPeriod(from, settings.closedThrough)) return "";
  return settings.snapshots?.[ym] ? ym : "";
}
