// ===========================================
// SALE-22: สาขาของผู้ซื้อบนใบกำกับภาษี (ประกาศอธิบดีฯ ฉบับที่ 199 — ผู้ซื้อที่จด VAT ต้องระบุ
// "สำนักงานใหญ่" หรือ "สาขาที่ xxxxx") — รหัสแบบเดียวกับ TaxInvoices.CustomerBranchSnapshot
// ===========================================

/** รหัสสาขา 5 หลัก: HQ = "00000" · Branch = เลขสาขาเติม 0 · ไม่ระบุ = "" */
export function branchCode(branchType: string | undefined, branchNumber: string | undefined): string {
  if (branchType === "HQ") return "00000";
  if (branchType === "Branch" && branchNumber) return String(branchNumber).padStart(5, "0");
  return "";
}

/** ข้อความแสดงบนเอกสาร */
export function branchDisplay(code: string | undefined): string {
  if (!code) return "";
  return code === "00000" ? "สำนักงานใหญ่ (00000)" : `สาขาที่ ${code}`;
}

/**
 * SALE-24: ใบเสร็จรับเงิน/ใบกำกับภาษี (โหมดรวม) = ใบกำกับเต็มรูป → ผู้ซื้อที่มีเลขผู้เสียภาษีต้องมีสาขา
 * (กติกาเดียวกับ taxInvoice.issue) · บุคคลทั่วไปไม่มีเลขภาษี ออกได้ · คืนข้อความผิดพลาด หรือ null
 */
export function combinedReceiptBuyerBranchError(
  taxDocMode: string,
  customer: { TaxID?: string; BranchType?: string; BranchNumber?: string; CustomerName?: string },
): string | null {
  if (taxDocMode !== "combined") return null;
  const hasTaxId = String(customer.TaxID ?? "").replace(/\D/g, "").length === 13;
  if (!hasTaxId) return null;
  if (branchCode(customer.BranchType, customer.BranchNumber)) return null;
  return `ลูกค้า${customer.CustomerName ? ` "${customer.CustomerName}"` : ""} มีเลขผู้เสียภาษีแต่ยังไม่ระบุสาขา (สำนักงานใหญ่/สาขาที่) — ใบเสร็จรับเงิน/ใบกำกับภาษีต้องมีสาขาของผู้ซื้อ · แก้ที่ทะเบียนลูกค้าก่อน`;
}
