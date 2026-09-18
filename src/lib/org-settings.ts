// ===========================================
// Aim Expense — Organization.settings (JSON) helpers
// เก็บ setting เบา ๆ ที่ไม่คุ้มเพิ่ม column ใน Postgres
// ===========================================

/**
 * ธุรกิจจดทะเบียนภาษีมูลค่าเพิ่ม (VAT) หรือไม่
 * - ไม่เคยตั้งค่า (org เดิมทั้งหมด) → true = มี VAT (ไม่กระทบ flow เดิม)
 * - false → ใบเสนอราคา/ใบวางบิลใหม่ default เป็น "ไม่มี VAT"
 */
export function readVatRegistered(settings: unknown): boolean {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const v = (settings as Record<string, unknown>).vatRegistered;
    if (typeof v === "boolean") return v;
  }
  return true;
}
