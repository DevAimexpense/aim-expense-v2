// ===========================================
// Aim Expense — Payment Calculation Logic
// ย้ายมาจาก Core Event Payment System (Code.gs)
// สูตรเดิม 100% — TTL, WTH, VAT, GTTL
// ===========================================

/**
 * Payment calculation input
 */
export interface PaymentInput {
  costPerUnit: number;    // ค่าใช้จ่ายต่อหน่วย
  days: number;           // จำนวนวัน
  numberOfPeople: number; // จำนวนคน
  pctWTH: number;         // % หัก ณ ที่จ่าย (0, 1, 2, 3, 5, etc.)
  isVatPayee: boolean;    // ผู้รับเงินเสีย VAT หรือไม่
  /**
   * PUR-02: VAT ตามใบกำกับภาษีจริง (ถ้ามี) — ใช้แทน 7% ของฐาน
   * (ใบที่มีของยกเว้น VAT ปน / ปัดเศษต่างกัน) · ต้องผ่าน assertVatOverride ก่อน
   */
  vatOverride?: number | null;
}

/**
 * Payment calculation result
 */
export interface PaymentResult {
  ttlAmount: number;  // ยอดรวมก่อนหัก = CostPerUnit × Day × NoOfPPL
  wthAmount: number;  // หัก ณ ที่จ่าย = TTLAmount × (PctWTH / 100)
  vatAmount: number;  // VAT 7% = TTLAmount × 0.07 (ถ้า VatPayee)
  gttlAmount: number; // ยอดจ่ายจริง = (TTLAmount - WTH) + VAT
}

/**
 * คำนวณยอดเงินตามสูตร Core System
 *
 * สูตร:
 *   TTLAmount = CostPerUnit × Day × NoOfPPL
 *   WTH = TTLAmount × (PctWTH / 100)
 *   VAT = TTLAmount × 0.07 (ถ้า isVatPayee = true)
 *   GTTL = (TTLAmount - WTH) + VAT
 *
 * @param input - ข้อมูลสำหรับคำนวณ
 * @returns PaymentResult
 */
/**
 * PUR-02: VAT ตามใบต้องไม่ติดลบ และไม่เกิน 7% ของฐาน (เผื่อปัดเศษ 1 บาท)
 * — ต่ำกว่า 7% ได้ (ใบที่มีสินค้ายกเว้น VAT ปน) แต่เกินไม่ได้ (ขอภาษีซื้อเกินจริง)
 */
export function assertVatOverride(ttlAmount: number, vat: number): void {
  if (!Number.isFinite(vat) || vat < 0) throw new Error("ยอด VAT ตามใบต้องไม่ติดลบ");
  if (vat > roundTwo(ttlAmount * 0.07) + 1) {
    throw new Error(
      `ยอด VAT ตามใบ (${vat.toFixed(2)}) เกิน 7% ของยอดก่อน VAT (${roundTwo(ttlAmount * 0.07).toFixed(2)}) — ตรวจยอดก่อน VAT อีกครั้ง`,
    );
  }
}

/**
 * PUR-02d: ฐานภาษีซื้อสำหรับรายงาน ภ.พ.30 — ใบที่มีสินค้ายกเว้น VAT ปน (VAT ตามใบ < 7% ของยอดก่อน VAT)
 * ฐานที่เสียภาษีจริง = VAT ÷ 7% (ส่วนที่เหลือเป็นยอดยกเว้น) · ใบปกติ (VAT = 7% ± ปัดเศษ) → ยอดก่อน VAT เดิม
 */
export function taxableBaseFromVat(ttlAmount: number, vatAmount: number): number {
  if (!(vatAmount > 0) || !(ttlAmount > 0)) return ttlAmount;
  const full = roundTwo(ttlAmount * 0.07);
  if (vatAmount >= full - 0.02) return ttlAmount; // VAT เต็ม 7% (เผื่อปัดเศษ)
  return Math.min(ttlAmount, roundTwo(vatAmount / 0.07));
}

/**
 * PUR-02c: ใบเดียวแยกหลายรายการ — กระจาย "VAT รวมตามใบ" ไปยังรายการที่มี VAT ตามสัดส่วนยอด (รวม VAT)
 * เศษสตางค์ไปที่รายการ VAT สุดท้าย ให้ผลรวมเท่ายอดบนใบพอดี · รายการไม่มี VAT = 0
 */
export function allocateInvoiceVat(items: { amount: number; hasVat: boolean }[], totalVat: number): number[] {
  const vatIdx = items.map((it, i) => (it.hasVat && it.amount > 0 ? i : -1)).filter((i) => i >= 0);
  const out = items.map(() => 0);
  const base = vatIdx.reduce((s, i) => s + items[i].amount, 0);
  if (vatIdx.length === 0 || base <= 0 || !(totalVat > 0)) return out;
  let allocated = 0;
  vatIdx.forEach((i, k) => {
    if (k === vatIdx.length - 1) out[i] = roundTwo(totalVat - allocated);
    else {
      out[i] = roundTwo((totalVat * items[i].amount) / base);
      allocated = roundTwo(allocated + out[i]);
    }
  });
  return out;
}

export function calculatePayment(input: PaymentInput): PaymentResult {
  const { costPerUnit, days, numberOfPeople, pctWTH, isVatPayee } = input;

  // TTLAmount = CostPerUnit × Day × NoOfPPL
  const ttlAmount = roundTwo(costPerUnit * days * numberOfPeople);

  // WTH = TTLAmount × (PctWTH / 100)
  const wthAmount = roundTwo(ttlAmount * (pctWTH / 100));

  // VAT = TTLAmount × 0.07 (เฉพาะ VatPayee) · PUR-02: มี VAT ตามใบ → ใช้ตามใบ
  const vatOverride = input.vatOverride;
  const vatAmount = !isVatPayee
    ? 0
    : vatOverride != null && Number.isFinite(vatOverride)
      ? roundTwo(vatOverride)
      : roundTwo(ttlAmount * 0.07);

  // GTTL = (TTLAmount - WTH) + VAT
  const gttlAmount = roundTwo(ttlAmount - wthAmount + vatAmount);

  return { ttlAmount, wthAmount, vatAmount, gttlAmount };
}

/**
 * คำนวณ % การใช้จ่ายจาก Budget
 */
export function calculateBudgetUsage(
  totalSpent: number,
  budget: number
): { percentage: number; remaining: number; isOverBudget: boolean } {
  if (budget <= 0) {
    return { percentage: 0, remaining: 0, isOverBudget: false };
  }
  const percentage = roundTwo((totalSpent / budget) * 100);
  const remaining = roundTwo(budget - totalSpent);
  const isOverBudget = totalSpent > budget;

  return { percentage, remaining, isOverBudget };
}

/**
 * สรุปยอดรวมหลายรายการ
 */
export function summarizePayments(
  payments: PaymentResult[]
): PaymentResult {
  return payments.reduce(
    (acc, p) => ({
      ttlAmount: roundTwo(acc.ttlAmount + p.ttlAmount),
      wthAmount: roundTwo(acc.wthAmount + p.wthAmount),
      vatAmount: roundTwo(acc.vatAmount + p.vatAmount),
      gttlAmount: roundTwo(acc.gttlAmount + p.gttlAmount),
    }),
    { ttlAmount: 0, wthAmount: 0, vatAmount: 0, gttlAmount: 0 }
  );
}

/**
 * Format เงินเป็นรูปแบบไทย (฿)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ตัวเลขมี comma
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ===== Helper =====

/**
 * ปัดเศษ 2 ตำแหน่ง
 */
function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
