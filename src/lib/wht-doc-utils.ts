// ===========================================
// WHT Certificate Document Utilities
// Helpers สำหรับ: generate เลขเล่มที่/เลขที่, map WHT type → income type, ภ.ง.ด. form
// ===========================================

/** ดึงลำดับ (SSS) จากเลขที่ที่เก็บไว้ "เล่มที่|MMDD/SSS" หรือ "MMDD/SSS" — null ถ้า parse ไม่ได้ */
export function parseWhtCertSeq(certNo: string | undefined | null): number | null {
  if (!certNo) return null;
  const m = /\/(\d+)\s*$/.exec(certNo);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Generate เลขเล่มที่ + เลขที่เอกสาร ของหนังสือรับรองหัก ณ ที่จ่าย
 *
 * Rule:
 * - เล่มที่ = ปี ค.ศ. ของวันที่ออกเอกสาร
 * - เลขที่ = MMDD/SEQ เช่น "0224/003"
 *   - MMDD = เดือน+วันที่ออกเอกสาร
 *   - SEQ = ลำดับที่ (running count) ของหนังสือรับรอง WHT ใน **เดือน** นั้น (3 หลัก เติม 0)
 *
 * @param docDate - วันที่ออกเอกสาร (ISO YYYY-MM-DD)
 * @param allMonthPayments - รายการ payment ทั้งเดือนที่มี WHT > 0 (เรียงตาม CreatedAt)
 *   ถ้ามี WhtCertNo ("เล่มที่|MMDD/SSS") ที่เก็บไว้แล้ว เลขใหม่จะไม่ต่ำกว่า max(SSS)+1 (DOC-21)
 * @param thisPaymentId - paymentId ของรายการปัจจุบัน (หาตำแหน่งใน list)
 */
export function generateWhtDocNumber(
  docDate: string,
  allMonthPayments: Array<{ PaymentID: string; CreatedAt?: string; WhtCertNo?: string }>,
  thisPaymentId: string
): { book: string; number: string } {
  const d = new Date(docDate);
  const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const month = isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  const day = isNaN(d.getTime()) ? new Date().getDate() : d.getDate();
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");

  // หาลำดับของ payment ปัจจุบันในลิสต์ (เรียงตาม CreatedAt → PaymentID เป็น tie-break
  // ให้ลำดับคงที่ทุกครั้งที่ render แม้ CreatedAt เท่ากัน/ว่าง — DOC-04)
  const sorted = [...allMonthPayments].sort((a, b) => {
    const c = (a.CreatedAt || "").localeCompare(b.CreatedAt || "");
    return c !== 0 ? c : a.PaymentID.localeCompare(b.PaymentID);
  });
  const idx = sorted.findIndex((p) => p.PaymentID === thisPaymentId);
  // DOC-21: ลิสต์ของเดือนเปลี่ยนได้ (รายการก่อนหน้าถูกยกเลิก/ปฏิเสธ) → ตำแหน่งอย่างเดียวซ้ำกับเลขที่
  // ออกไปแล้วได้ — เลขใหม่ต้องมากกว่าทุกเลขที่เก็บไว้แล้วของเดือนนั้นด้วย
  const maxStoredSeq = allMonthPayments.reduce(
    (m, p) => (p.PaymentID === thisPaymentId ? m : Math.max(m, parseWhtCertSeq(p.WhtCertNo) ?? 0)),
    0
  );
  const seq = Math.max(idx >= 0 ? idx + 1 : 1, maxStoredSeq + 1);
  const seqStr = String(seq).padStart(3, "0");

  return {
    book: String(year),
    number: `${monthStr}${dayStr}/${seqStr}`,
  };
}

/**
 * วันที่ของหนังสือรับรองหัก ณ ที่จ่าย = **วันที่จ่ายเงิน หรือวันที่ตามใบเสร็จเท่านั้น**
 * (ห้ามใช้วันที่คีย์รายการ / วันที่อนุมัติ / วันนี้)
 *
 *   - รายการปกติ (ตั้งเบิก → อนุมัติ → จ่าย): PaymentDate (วันที่จ่ายจริง) → ReceiptDate
 *   - "บันทึกค่าใช้จ่าย" รุ่นเก่า (ก่อนแก้ 2026-10): ระบบเคยใส่ PaymentDate = วันที่คีย์
 *     ตรวจได้จาก PaymentDate == วันที่ของ CreatedAt และข้ามอนุมัติ (ApprovedAt == PaidAt)
 *     → ใช้ ReceiptDate แทนถ้ามี
 *
 * คืน "" ถ้ายังไม่มีทั้งสองวันที่ — ผู้เรียกต้องไม่ออกเอกสาร
 */
export function resolveWhtCertDate(p: {
  PaymentDate?: string;
  ReceiptDate?: string;
  CreatedAt?: string;
  ApprovedAt?: string;
  PaidAt?: string;
}): string {
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}/.test(v);
  const pay = isDate(p.PaymentDate) ? p.PaymentDate!.slice(0, 10) : "";
  const receipt = isDate(p.ReceiptDate) ? p.ReceiptDate!.slice(0, 10) : "";
  const paidDirect = !!p.ApprovedAt && p.ApprovedAt === p.PaidAt;
  const stampedWithEntryDate =
    paidDirect && !!pay && pay === (p.CreatedAt || "").slice(0, 10);
  if (stampedWithEntryDate && receipt) return receipt;
  return pay || receipt;
}

/**
 * ตัดสิน ภ.ง.ด. form จากประเภทผู้ถูกหัก (payee)
 *   - ภ.ง.ด.3 = บุคคลธรรมดา (TaxID ขึ้นต้น 1-8 = เลขบัตรประชาชน)
 *   - ภ.ง.ด.53 = นิติบุคคล (TaxID ขึ้นต้น 0 = เลขผู้เสียภาษีนิติบุคคล)
 */
export function getPndForm(payeeTaxId: string, payeeBranchType?: string): "3" | "53" {
  const digits = (payeeTaxId || "").replace(/\D/g, "");
  if (digits.length === 13) {
    // นิติบุคคล: เลขเริ่มด้วย 0
    if (digits.startsWith("0")) return "53";
    // บุคคลธรรมดา: เลขบัตร ปชช เริ่มด้วย 1-8
    return "3";
  }
  // Fallback เมื่อไม่มีเลข 13 หลัก: ค่าเริ่มต้นของผู้รับเงินทุกคนคือ "HQ" (payee.router / หน้า payees)
  // จึงใช้ HQ เป็นหลักฐานนิติบุคคลไม่ได้ (DOC-20 — ฟรีแลนซ์ที่ไม่กรอกเลขบัตรเคยถูกย้ายไป ภ.ง.ด.53)
  // นับเป็นนิติบุคคลเฉพาะที่ผู้ใช้ระบุ "สาขา" ไว้ชัดเจน นอกนั้น = บุคคลธรรมดา (ภ.ง.ด.3) เหมือนรายงานเดิม
  if (payeeBranchType === "Branch") return "53";
  return "3";
}

/**
 * Map WHT type → ประเภทเงินได้ตามฟอร์ม ภ.ง.ด.
 *
 * Sections ในฟอร์ม:
 *   1 = เงินเดือน ค่าจ้าง ตามมาตรา 40(1)
 *   2 = ค่าธรรมเนียม ค่านายหน้า ตามมาตรา 40(2)
 *   3 = ค่าแห่งลิขสิทธิ์ ตามมาตรา 40(3)
 *   4a = ดอกเบี้ย ตามมาตรา 40(4)(ก)
 *   4b = เงินปันผล ตามมาตรา 40(4)(ข)
 *   5 = การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่ง 3 เตรส (ค่าเช่า/โฆษณา/ขนส่ง/บริการ ฯลฯ)
 *   6 = อื่น ๆ (custom / วิชาชีพอิสระ)
 */
export type WhtIncomeSection = "1" | "2" | "3" | "4a" | "4b" | "5" | "6";

export function mapWhtToIncomeSection(wthTypeId: string): {
  section: WhtIncomeSection;
  label: string;
} {
  const MAP: Record<string, { section: WhtIncomeSection; label: string }> = {
    "service-1": { section: "5", label: "ค่ารับเหมา/บริการ" },
    "transport-1": { section: "5", label: "ค่าขนส่ง" },
    "ad-2": { section: "5", label: "ค่าโฆษณา" },
    "service-3": { section: "5", label: "ค่าบริการ" },
    "contract-3": { section: "5", label: "ค่ารับเหมา" },
    "commission-3": { section: "2", label: "ค่านายหน้า" },
    "rental-5": { section: "5", label: "ค่าเช่า" },
    "professional-5": { section: "6", label: "ค่าวิชาชีพอิสระ" },
    "show-5": { section: "5", label: "ค่าแสดงของนักแสดงสาธารณะ" },
  };
  return MAP[wthTypeId] || { section: "6", label: "อื่น ๆ" };
}
