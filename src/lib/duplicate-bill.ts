// ===========================================
// PUR-06: ตรวจบิลซ้ำ — เลขผู้เสียภาษีผู้ขาย + เลขที่เอกสาร (ใบแจ้งหนี้/ใบเสร็จ/ใบกำกับ) เดียวกัน
// ส่งใน LINE แล้วอัปโหลดเว็บซ้ำ / คนละคนบันทึกบิลเดียวกัน = ค่าใช้จ่ายและภาษีซื้อ ×2
// Pim 16/11/2569: **เตือน ไม่บล็อก** (ใบผ่อนชำระ/ใบที่ผู้ขายใช้เลขซ้ำจริงมีได้)
// ===========================================

type Row = Record<string, string | undefined>;

/** ปรับเลขเอกสารให้เทียบกันได้: ตัดช่องว่าง/ขีด/ทับ ตัวพิมพ์ใหญ่ · ตัด 0 นำหน้าในตัวเลขล้วน */
export function normalizeDocNo(v: string | undefined): string {
  const s = String(v ?? "")
    .toUpperCase()
    .replace(/[\s\-_/\\.#:]/g, "");
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s;
}

const normalizeTaxId = (v: string | undefined) => String(v ?? "").replace(/\D/g, "");

const IGNORED = new Set(["cancelled", "rejected"]);

export type DuplicateHit = { paymentId: string; description: string; amount: number; date: string; status: string };

/**
 * รายการเดิมที่น่าจะเป็นบิลเดียวกัน — ต้องรู้เลขผู้เสียภาษีผู้ขาย (13 หลัก) และมีเลขเอกสารอย่างน้อย 1 เลข
 * (ไม่รู้ผู้ขาย = ระบุไม่ได้ว่าซ้ำ → ไม่เตือน กันเตือนมั่ว)
 */
export function findDuplicateBills(
  payments: Row[],
  bill: {
    vendorTaxId?: string;
    docNumbers: (string | undefined)[];
    excludePaymentId?: string;
    /** PUR-06b: รายการที่สร้างจากใบเดียวกันในรอบเดียวกัน (แยกหลายบรรทัด) — ไม่ใช่บิลซ้ำ */
    excludePaymentIds?: string[];
  },
): DuplicateHit[] {
  const taxId = normalizeTaxId(bill.vendorTaxId);
  if (taxId.length !== 13) return [];
  const nos = new Set(bill.docNumbers.map(normalizeDocNo).filter((n) => n.length >= 2));
  if (nos.size === 0) return [];
  const hits: DuplicateHit[] = [];
  for (const p of payments) {
    if (p.PaymentID === bill.excludePaymentId) continue;
    if (p.PaymentID && bill.excludePaymentIds?.includes(p.PaymentID)) continue;
    if (IGNORED.has(p.Status || "")) continue;
    if (normalizeTaxId(p.VendorTaxIdSnapshot) !== taxId) continue;
    const theirs = [p.InvoiceNumber, p.ReceiptNumber].map(normalizeDocNo).filter(Boolean);
    if (!theirs.some((n) => nos.has(n))) continue;
    hits.push({
      paymentId: p.PaymentID || "",
      description: p.Description || "",
      amount: parseFloat(p.GTTLAmount || "") || 0,
      date: (p.ReceiptDate || p.PaymentDate || p.CreatedAt || "").slice(0, 10),
      status: p.Status || "",
    });
  }
  return hits;
}

/** ข้อความเตือนสั้นสำหรับแสดงผู้ใช้ */
export function duplicateWarningText(hits: DuplicateHit[]): string | undefined {
  if (hits.length === 0) return undefined;
  const first = hits[0];
  return `⚠️ อาจเป็นบิลซ้ำ — ผู้ขายและเลขที่เอกสารเดียวกับรายการ "${first.description}" ยอด ${first.amount.toLocaleString("th-TH")} บาท${
    hits.length > 1 ? ` (และอีก ${hits.length - 1} รายการ)` : ""
  } · บันทึกไว้แล้ว ตรวจสอบก่อนอนุมัติ/จ่าย`;
}
