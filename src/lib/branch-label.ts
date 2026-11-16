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
