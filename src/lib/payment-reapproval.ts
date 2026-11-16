// ===========================================
// CTRL-04: แก้สาระสำคัญของรายการจ่ายหลังอนุมัติ → ต้องกลับไปรออนุมัติ (Pim 16/11/2569)
//
// "สาระสำคัญ" = สิ่งที่ผู้อนุมัติดูตอนอนุมัติ: ยอด (ก่อน VAT / VAT / หัก ณ ที่จ่าย / ยอดจ่าย), ผู้รับเงิน,
// บัญชีต้นทาง, ประเภทการเบิก, ประเภทเอกสาร (เปลี่ยนสิทธิ์ภาษีซื้อ), โปรเจกต์ (งบ)
// แก้หมายเหตุ/หมวด/รายละเอียด → ไม่ต้องอนุมัติใหม่
// อนุมัติใหม่ → คืนสถานะเดิม (จ่ายแล้วยังเป็นจ่ายแล้ว วันที่จ่ายเดิม) ไม่ใช่เริ่มนับจาก "อนุมัติ"
// ===========================================

type Row = Record<string, string | number | undefined>;

const MONEY_FIELDS = ["TTLAmount", "VATAmount", "WTHAmount", "GTTLAmount"] as const;
const TEXT_FIELDS = ["PayeeID", "CompanyBankID", "ExpenseType", "DocumentType", "EventID"] as const;

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** สถานะที่ผ่านการอนุมัติแล้ว */
export const POST_APPROVAL = new Set(["approved", "paid", "cleared"]);

/** ฟิลด์สาระสำคัญที่เปลี่ยน (ว่าง = ไม่ต้องอนุมัติใหม่) */
export function materialChanges(existing: Row, updates: Row): string[] {
  const changed: string[] = [];
  for (const f of MONEY_FIELDS) {
    if (updates[f] === undefined) continue;
    if (Math.abs(num(updates[f]) - num(existing[f])) >= 0.005) changed.push(f);
  }
  for (const f of TEXT_FIELDS) {
    if (updates[f] === undefined) continue;
    if (String(updates[f] ?? "").trim() !== String(existing[f] ?? "").trim()) changed.push(f);
  }
  return changed;
}

/** สถานะหลังอนุมัติใหม่: คืนสถานะก่อนแก้ (จ่ายแล้ว/เคลียร์แล้ว) · ไม่มี = อนุมัติตามปกติ */
export function statusAfterReapproval(reapprovalOf: string | undefined): "approved" | "paid" | "cleared" {
  return reapprovalOf === "paid" || reapprovalOf === "cleared" ? reapprovalOf : "approved";
}
