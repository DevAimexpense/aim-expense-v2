// ===========================================
// WHT Certificate Document Utilities
// Helpers สำหรับ: generate เลขเล่มที่/เลขที่, map WHT type → income type, ภ.ง.ด. form
// ===========================================

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
 * @param thisPaymentId - paymentId ของรายการปัจจุบัน (หาตำแหน่งใน list)
 */
export function generateWhtDocNumber(
  docDate: string,
  allMonthPayments: Array<{ PaymentID: string; CreatedAt?: string }>,
  thisPaymentId: string
): { book: string; number: string } {
  const d = new Date(docDate);
  const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const month = isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  const day = isNaN(d.getTime()) ? new Date().getDate() : d.getDate();
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");

  // หาลำดับของ payment ปัจจุบันในลิสต์ (เรียงตาม CreatedAt)
  const sorted = [...allMonthPayments].sort((a, b) =>
    (a.CreatedAt || "").localeCompare(b.CreatedAt || "")
  );
  const idx = sorted.findIndex((p) => p.PaymentID === thisPaymentId);
  const seq = idx >= 0 ? idx + 1 : 1;
  const seqStr = String(seq).padStart(3, "0");

  return {
    book: String(year),
    number: `${monthStr}${dayStr}/${seqStr}`,
  };
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
  // Fallback: ใช้ branchType
  //   - ถ้ามี branchType (HQ/Branch) → นิติบุคคล
  if (payeeBranchType === "HQ" || payeeBranchType === "Branch") return "53";
  return "3"; // default = บุคคล
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
