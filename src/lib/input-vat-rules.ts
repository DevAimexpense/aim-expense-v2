// ===========================================
// PUR-03 / PUR-04: ภาษีซื้อที่นำมาหักไม่ได้ (ภาษีซื้อต้องห้าม) — ตามกฎหมาย (Pim 16/11/2569)
//
// ประมวลรัษฎากร ม.82/5 + ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีมูลค่าเพิ่ม (ฉบับที่ 42):
//   (1)(2) ไม่มีใบกำกับ / ใบกำกับไม่ถูกต้อง-ไม่สมบูรณ์ (เช่น ชื่อ/ที่อยู่/เลขผู้ซื้อไม่ใช่กิจการ)
//   (3)    ไม่เกี่ยวกับการประกอบกิจการ
//   (4)    ค่ารับรองหรือค่าใช้จ่ายที่มีลักษณะเดียวกัน
//   (6)    ใบกำกับภาษีอย่างย่อ (ขอคืนไม่ได้ — ต้องเป็นใบกำกับเต็มรูป ม.86/4)
//   ประกาศฯ ฉบับที่ 42: ภาษีซื้อเกี่ยวกับรถยนต์นั่ง/รถยนต์โดยสารไม่เกิน 10 คน (ซื้อ เช่าซื้อ เช่า
//          ค่าน้ำมัน ค่าซ่อม) — เว้นกิจการขาย/ให้เช่ารถ/ขนส่ง (ผู้ใช้ไม่ต้องเลือกเหตุนี้)
// ภาษีซื้อต้องห้าม → ไม่เข้า ภ.พ.30 แต่ยังเป็นต้นทุน/ค่าใช้จ่ายของกิจการ (P&L รวม VAT)
// ===========================================

export const NON_DEDUCTIBLE_REASONS = [
  { value: "entertainment", label: "ค่ารับรอง (ม.82/5(4))" },
  { value: "passenger_car", label: "รถยนต์นั่ง/รถโดยสารไม่เกิน 10 ที่นั่ง — ซื้อ เช่า น้ำมัน ซ่อม (ประกาศฯ ฉบับที่ 42)" },
  { value: "not_business", label: "ไม่เกี่ยวกับการประกอบกิจการ (ม.82/5(3))" },
  { value: "invalid_tax_invoice", label: "ใบกำกับไม่ถูกต้อง/ไม่สมบูรณ์ หรือชื่อผู้ซื้อไม่ใช่กิจการ (ม.82/5(1)(2))" },
] as const;

export type NonDeductibleReason = (typeof NON_DEDUCTIBLE_REASONS)[number]["value"];

export const NON_DEDUCTIBLE_VALUES = NON_DEDUCTIBLE_REASONS.map((r) => r.value) as [NonDeductibleReason, ...NonDeductibleReason[]];

/** หมวดค่าใช้จ่ายที่กฎหมายห้ามขอคืนภาษีซื้อเสมอ */
const FORCED_BY_CATEGORY: Record<string, NonDeductibleReason> = {
  ค่ารับรอง: "entertainment",
};

/**
 * เหตุภาษีซื้อต้องห้ามที่ใช้จริง — หมวด "ค่ารับรอง" บังคับตามกฎหมาย (เลือกเองไม่ได้) · อื่น ๆ ตามที่ผู้ใช้เลือก
 * คืน "" = ขอคืนได้ (ถ้าเป็นใบกำกับเต็มรูป)
 */
export function resolveNonDeductibleVat(categoryMain: string | undefined, chosen: string | undefined): string {
  const forced = FORCED_BY_CATEGORY[(categoryMain || "").trim()];
  if (forced) return forced;
  return NON_DEDUCTIBLE_VALUES.includes(chosen as NonDeductibleReason) ? (chosen as string) : "";
}

export function nonDeductibleLabel(code: string | undefined): string {
  return NON_DEDUCTIBLE_REASONS.find((r) => r.value === code)?.label || "";
}

/** ภาษีซื้อของรายการนี้นำมาหักใน ภ.พ.30 ได้ไหม (ต้องเป็นใบกำกับเต็มรูป + ไม่ต้องห้าม) */
export function isInputVatClaimable(p: { DocumentType?: string; NonDeductibleVat?: string; CategoryMain?: string }): boolean {
  if (p.DocumentType !== "tax_invoice") return false; // รวม tax_invoice_abbr (อย่างย่อ) — ขอคืนไม่ได้
  return resolveNonDeductibleVat(p.CategoryMain, p.NonDeductibleVat) === "";
}
