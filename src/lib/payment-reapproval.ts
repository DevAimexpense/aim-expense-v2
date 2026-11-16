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

/** CTRL-15: ฟิลด์ที่เก็บไว้คืนตอน "ปฏิเสธการแก้" — สาระสำคัญ + ค่าที่คำนวณ/อ้างอิงตามกัน */
export const SNAPSHOT_FIELDS = [
  ...MONEY_FIELDS,
  ...TEXT_FIELDS,
  "CostPerUnit",
  "Days",
  "NoOfPPL",
  "PctWTH",
  "WthTypeId",
  "VendorTaxIdSnapshot",
  "VendorBranchInfo",
  "NonDeductibleVat",
  "ApprovedBy",
  "ApprovedAt",
] as const;

/** ค่าก่อนแก้ — แก้หลายครั้งก่อนอนุมัติ ใช้ snapshot แรก (ค่าที่เคยอนุมัติจริง) */
export function reapprovalSnapshot(existing: Row): string {
  if (existing.ReapprovalSnapshot) return String(existing.ReapprovalSnapshot);
  const snap: Record<string, string> = {};
  for (const f of SNAPSHOT_FIELDS) snap[f] = String(existing[f] ?? "");
  return JSON.stringify(snap);
}

/**
 * CTRL-15: "ปฏิเสธ" รายการที่กลับมารออนุมัติเพราะถูกแก้ = ปฏิเสธการแก้ → คืนค่าเดิม + สถานะเดิม
 * (ไม่ใช่ทำให้รายการที่จ่ายเงินไปแล้วกลายเป็น rejected) · ไม่มี snapshot → คืนแค่สถานะ
 */
export function revertReapproval(existing: Row): Record<string, string> {
  let snap: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(existing.ReapprovalSnapshot || "{}"));
    if (parsed && typeof parsed === "object") snap = parsed as Record<string, string>;
  } catch {
    snap = {};
  }
  const restored: Record<string, string> = {};
  for (const f of SNAPSHOT_FIELDS) if (f in snap) restored[f] = String(snap[f] ?? "");
  return {
    ...restored,
    Status: String(existing.ReapprovalOf || "approved"),
    ReapprovalOf: "",
    ReapprovalSnapshot: "",
  };
}

/** สถานะหลังอนุมัติใหม่: คืนสถานะก่อนแก้ (จ่ายแล้ว/เคลียร์แล้ว) · ไม่มี = อนุมัติตามปกติ */
export function statusAfterReapproval(reapprovalOf: string | undefined): "approved" | "paid" | "cleared" {
  return reapprovalOf === "paid" || reapprovalOf === "cleared" ? reapprovalOf : "approved";
}
