// ===========================================
// CTRL-01: ปิดงวดบัญชี (Pim 16/11/2569: "ให้ user กำหนดสิทธิ์ได้ · default เป็นเจ้าของก่อน")
//
// ปิดงวดถึงเดือน X = เอกสาร/รายการที่ลงงวดเดือน ≤ X แก้/ยกเลิก/ออกใหม่ไม่ได้ (รายงาน ภ.พ.30 / ภ.ง.ด.
// ที่ยื่นแล้วต้องไม่เปลี่ยนเงียบ ๆ — พ.ร.บ.การบัญชี) · ต้องแก้จริง → ผู้มีสิทธิ์เปิดงวดก่อน (มี audit log)
// เก็บใน organization.settings (ค่าตั้งค่า ไม่ใช่ข้อมูลธุรกิจ — Zero Data Retention)
// ===========================================

export type PeriodCloseSettings = {
  /** เดือนล่าสุดที่ปิดแล้ว (YYYY-MM) · "" = ยังไม่เคยปิด */
  closedThrough: string;
  /** ผู้มีสิทธิ์ปิด/เปิดงวด + มอบสิทธิ์ (เจ้าขององค์กรมีเสมอ) */
  managers: string[];
};

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readPeriodClose(settings: unknown): PeriodCloseSettings {
  const raw =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? ((settings as Record<string, unknown>).periodClose as Record<string, unknown> | undefined)
      : undefined;
  const closedThrough = typeof raw?.closedThrough === "string" && YM.test(raw.closedThrough) ? raw.closedThrough : "";
  const managers = Array.isArray(raw?.managers) ? (raw!.managers as unknown[]).filter((v): v is string => typeof v === "string") : [];
  return { closedThrough, managers };
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
 * วันที่ที่รายการจ่ายถูกนับในรายงาน (ภาษีซื้อ / ภ.ง.ด.) — ใช้ตรวจปิดงวด
 * เฉพาะรายการที่จ่ายแล้ว (pending/approved ยังไม่อยู่ในรายงาน → แก้ได้)
 */
export function paymentReportDates(p: PaymentRow): string[] {
  if (!SETTLED.has(p.Status || "")) return [];
  const dates = [p.ReceiptDate, p.PaymentDate, (p.PaidAt || "").slice(0, 10)].filter((d): d is string => !!d);
  return Array.from(new Set(dates.map((d) => d.slice(0, 10))));
}
