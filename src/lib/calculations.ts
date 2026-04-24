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
export function calculatePayment(input: PaymentInput): PaymentResult {
  const { costPerUnit, days, numberOfPeople, pctWTH, isVatPayee } = input;

  // TTLAmount = CostPerUnit × Day × NoOfPPL
  const ttlAmount = roundTwo(costPerUnit * days * numberOfPeople);

  // WTH = TTLAmount × (PctWTH / 100)
  const wthAmount = roundTwo(ttlAmount * (pctWTH / 100));

  // VAT = TTLAmount × 0.07 (เฉพาะ VatPayee)
  const vatAmount = isVatPayee ? roundTwo(ttlAmount * 0.07) : 0;

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
