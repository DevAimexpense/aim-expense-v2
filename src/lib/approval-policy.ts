// ===========================================
// CTRL-04b: แบ่งแยกหน้าที่ในการจ่ายเงิน (Pim 16/11/2569 "แก้เลย" — ใช้แนวทางที่แนะนำใน AUDIT 1709)
//   1) ห้ามอนุมัติรายการที่ตัวเองสร้าง/แก้ (สาระสำคัญ) — ยกเว้นองค์กรไม่มีผู้อนุมัติคนอื่น
//      (กิจการคนเดียว/เจ้าของคนเดียวที่อนุมัติได้ ต้องยังทำงานได้)
//   2) "บันทึกค่าใช้จ่าย (จ่ายแล้ว)" โดยคนที่ไม่มีสิทธิ์อนุมัติ → บันทึกเป็น "รออนุมัติ"
//      อนุมัติแล้วจึงเป็น "จ่ายแล้ว" ตามวันที่จ่ายเดิม (ApproveTo = "paid")
// ===========================================

/** ผู้ใช้นี้อนุมัติรายการจ่ายได้ไหม (admin ข้ามสิทธิ์ทั้งหมด — แบบเดียวกับ permissionProcedure) */
export function canApprovePayments(role: string, permissions: { approvePayments?: boolean }): boolean {
  return role === "admin" || !!permissions.approvePayments;
}

/** สถานะตอนสร้าง: ขอ "จ่ายแล้ว" แต่ไม่มีสิทธิ์อนุมัติ → รออนุมัติ (และจำไว้ว่าอนุมัติแล้วให้เป็นจ่ายแล้ว) */
export function initialPaymentStatus(
  requested: "pending" | "paid",
  canApprove: boolean,
): { status: "pending" | "paid"; approveTo: "" | "paid" } {
  if (requested !== "paid") return { status: "pending", approveTo: "" };
  return canApprove ? { status: "paid", approveTo: "" } : { status: "pending", approveTo: "paid" };
}

/**
 * รายการที่ผู้อนุมัติคนนี้อนุมัติไม่ได้ เพราะเป็นคนสร้าง หรือคนที่แก้สาระสำคัญล่าสุด
 * otherApprovers = จำนวนสมาชิกอื่นที่อนุมัติได้ (0 = ไม่มีใครอื่น → อนุมัติเองได้)
 */
export function selfApprovalViolations<T extends Record<string, string | undefined>>(
  rows: T[],
  approverUserId: string,
  otherApprovers: number,
  approverLineUserId?: string | null,
): T[] {
  if (otherApprovers === 0) return [];
  return rows.filter((r) => {
    if (r.ReapprovalBy && r.ReapprovalBy === approverUserId) return true;
    // รายการจาก LINE: ผู้สร้างตัวจริง = ผู้ส่ง (กลุ่ม LINE บันทึกในนามแอดมินที่ผูกกลุ่ม — แอดมินไม่ใช่ผู้ขอเบิก)
    if (r.CreatedBy === "LINE OA") {
      return !!r.LineSenderId && !!approverLineUserId && r.LineSenderId === approverLineUserId;
    }
    return r.CreatedByUserId === approverUserId;
  });
}
