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
