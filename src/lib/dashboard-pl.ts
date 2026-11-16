// ===========================================
// RPT-01: กำไร/ขาดทุน บน Dashboard — ฟังก์ชันล้วน (เทสต์ได้)
//
// เดิม: รายได้ = ยอดรวม VAT ของใบวางบิล · รายจ่าย = ยอดจ่ายสุทธิ (หลังหัก WHT, รวม VAT)
//       รวมรายการรออนุมัติ · ตัวกรองเดือนไม่ถูกใช้ → กำไรเพี้ยน
// ใหม่: รายได้ = ยอดก่อน VAT (หลังส่วนลด) ของเอกสารขายที่ออกแล้ว ตามวันที่เอกสาร
//       รายจ่าย = ยอดก่อนหัก ณ ที่จ่าย ของรายการที่อนุมัติแล้วขึ้นไป ตามวันที่ใบเสร็จ/จ่าย
//       VAT ซื้อ: ขอคืนได้ (จด VAT + ใบกำกับเต็มรูป) → ไม่ใช่ต้นทุน · ขอคืนไม่ได้ → เป็นต้นทุน
//       (หัก ณ ที่จ่าย ไม่ใช่ส่วนลด — เป็นภาษีที่นำส่งแทนผู้รับเงิน ค่าใช้จ่ายยังเต็มจำนวน)
// ===========================================

export type PlPayment = {
  eventId: string;
  status: string;
  ttlAmount: number;
  vatAmount: number;
  documentType: string;
  receiptDate: string;
  paymentDate: string;
  dueDate: string;
  createdAt: string;
};

export type PlBilling = {
  eventId: string;
  status: string;
  docDate: string;
  subtotal: number;
  sourceQuotationId?: string;
};

/** RPT-02: ใบกำกับภาษี — นับเป็นรายได้เฉพาะใบที่ไม่มีใบวางบิล/ใบเสร็จต้นทาง (ไม่งั้นนับซ้ำ) */
export type PlTaxInvoice = {
  eventId: string;
  status: string;
  docDate: string;
  subtotal: number;
  sourceBillingId: string;
  sourceQuotationId: string;
};

/** สถานะค่าใช้จ่ายที่ถือว่าเกิดขึ้นแล้ว (ไม่นับ รออนุมัติ / ไม่อนุมัติ / ยกเลิก) */
const INCURRED = new Set(["approved", "paid", "cleared"]);
/** เอกสารขายที่ยังไม่ใช่รายได้ */
const NOT_REVENUE = new Set(["void", "draft", "cancelled"]);

export function expenseDateOf(p: PlPayment): string {
  return (p.receiptDate || p.paymentDate || p.dueDate || (p.createdAt || "").slice(0, 10) || "").slice(0, 10);
}

/** ต้นทุนของรายการ (ไม่รวม VAT ที่ขอคืนได้) */
export function expenseCostOf(p: PlPayment, vatRegistered: boolean): number {
  const vatClaimable = vatRegistered && p.documentType === "tax_invoice";
  return (p.ttlAmount || 0) + (vatClaimable ? 0 : p.vatAmount || 0);
}

const inPeriod = (date: string, month: string) => !month || (date || "").startsWith(month);
const inEvent = (id: string, eventId: string) => eventId === "all" || (id || "").trim() === eventId;

export function computeDashboardPL(params: {
  payments: PlPayment[];
  billings: PlBilling[];
  /** RPT-02: ใบกำกับภาษีที่ออกโดยไม่มีใบวางบิล (จากใบเสนอราคาโดยตรง / สร้างเอง) */
  taxInvoices?: PlTaxInvoice[];
  /** YYYY-MM · "" = ทั้งหมด */
  month: string;
  /** "all" หรือ EventID */
  eventId: string;
  vatRegistered: boolean;
}) {
  const { payments, billings, month, eventId, vatRegistered } = params;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let revenue = 0;
  // ใบเสนอราคาที่แปลงเป็นใบวางบิลแล้ว — ใบกำกับจากใบเสนอราคาเดียวกันเป็นรายการขายเดียวกัน (ไม่นับซ้ำ)
  const billedQuotations = new Set<string>();
  for (const b of billings) {
    if (NOT_REVENUE.has(b.status)) continue;
    if (b.sourceQuotationId) billedQuotations.add(b.sourceQuotationId);
    if (!inEvent(b.eventId, eventId) || !inPeriod(b.docDate, month)) continue;
    revenue += b.subtotal || 0;
  }
  let revenueFromTaxInvoices = 0;
  for (const t of params.taxInvoices || []) {
    if (t.status !== "issued") continue;
    if (t.sourceBillingId) continue; // ใบวางบิล/ใบเสร็จต้นทางนับไปแล้ว
    if (t.sourceQuotationId && billedQuotations.has(t.sourceQuotationId)) continue;
    if (!inEvent(t.eventId, eventId) || !inPeriod(t.docDate, month)) continue;
    revenueFromTaxInvoices += t.subtotal || 0;
  }
  revenue += revenueFromTaxInvoices;

  let expense = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const p of payments) {
    if (!inEvent(p.eventId, eventId)) continue;
    const date = expenseDateOf(p);
    if (!inPeriod(date, month)) continue;
    if (p.status === "pending") {
      pendingCount += 1;
      pendingAmount += expenseCostOf(p, vatRegistered);
      continue;
    }
    if (!INCURRED.has(p.status)) continue;
    expense += expenseCostOf(p, vatRegistered);
  }

  revenue = round2(revenue);
  expense = round2(expense);
  const profit = round2(revenue - expense);
  return {
    revenue,
    /** RPT-02: ส่วนของรายได้ที่มาจากใบกำกับภาษีที่ไม่มีใบวางบิล (แสดงใต้การ์ด) */
    revenueFromTaxInvoices: round2(revenueFromTaxInvoices),
    expense,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    pendingCount,
    pendingAmount: round2(pendingAmount),
  };
}

/** ช่วงวันที่ของเดือน YYYY-MM สำหรับรายงาน ภ.พ.30 */
export function monthRange(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}
