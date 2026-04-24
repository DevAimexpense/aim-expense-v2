// ===========================================
// Aim Expense — Expense Categories (R3 placeholder for R6)
// ===========================================
// 11 หมวดตาม Requirements Doc (HANDOFF_2026-04-16_0806_REQUIREMENTS.md)
// ใช้ hardcoded list ไปก่อน — R3 จะย้ายไปเป็น master sheet ภายหลัง
// + รองรับเพิ่มหมวดหมู่ใหม่ per-org
// ===========================================

export const EXPENSE_CATEGORIES_MAIN: readonly string[] = [
  "ค่าใช้จ่ายสำนักงาน",
  "ไอที & Software",
  "การตลาด & การโฆษณา",
  "ค่าเดินทาง",
  "ค่ารับรอง",
  "ค่าสาธารณูปโภค",
  "ค่าเช่า",
  "ค่าฝึกอบรม",
  "ค่าซ่อมแซม",
  "วัตถุดิบ/สินค้า",
  "อื่น ๆ",
] as const;

export type ExpenseCategoryMain = (typeof EXPENSE_CATEGORIES_MAIN)[number];

// Document Type & Expense Nature labels (ใช้ใน UI dropdown)
export const DOCUMENT_TYPE_OPTIONS = [
  { value: "receipt", label: "ใบเสร็จรับเงิน" },
  { value: "tax_invoice", label: "ใบกำกับภาษี" },
] as const;

export const EXPENSE_NATURE_OPTIONS = [
  { value: "goods", label: "สินค้า" },
  { value: "service", label: "บริการ" },
] as const;
