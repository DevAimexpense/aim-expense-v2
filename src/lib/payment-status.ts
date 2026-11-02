// ===========================================
// สถานะรายจ่าย (Payments.Status) ที่ถือว่า "จ่ายเงินแล้วจริง" สำหรับรายงานภาษี
// - "paid"    = จ่ายแล้ว
// - "cleared" = จ่ายแล้วและเคลียร์เงินสด/กระทบยอดแล้ว (payment.clearReconciliation)
// รายงาน ภ.ง.ด.3/53, ใบแนบ, ภาษีซื้อ, หัก ณ ที่จ่าย ต้องใช้ตัวนี้ ไม่ใช่เทียบ "paid" ตรง ๆ
// ===========================================
export const SETTLED_STATUSES = ["paid", "cleared"] as const;

export function isSettled(status: string | null | undefined): boolean {
  return status === "paid" || status === "cleared";
}
