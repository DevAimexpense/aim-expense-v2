// ===========================================
// Aim Expense — สถานะสิทธิ์เข้าถึงชีต/โฟลเดอร์เดิมของ org
//
// การยืนยันสิทธิ์ (Google Picker แบบ redirect — ใช้ได้ทุกอุปกรณ์ รวม iPad/มือถือ)
// อยู่ที่ GET /api/auth/google/regrant → Google → /api/auth/google/callback
// router นี้แค่รายงานสถานะให้การ์ดในหน้า ตั้งค่า › เชื่อมต่อ Google
// ===========================================

import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "../trpc";
import { checkOrgFileAccess, loadOrgFiles } from "../lib/google-file-access";

export const googleAccessRouter = router({
  /** สถานะสิทธิ์ของชีต + โฟลเดอร์ (ผู้ดูแล/เจ้าของ) */
  status: orgProcedure.query(async ({ ctx }) => {
    const loaded = await loadOrgFiles(ctx.org.orgId);
    const isOwner = loaded.ownerId === ctx.session.userId;
    // ตรวจสิทธิ์ก่อนใช้ token ของเจ้าของ
    if (ctx.org.role !== "admin" && !isOwner) {
      throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลหรือเจ้าของธุรกิจ" });
    }
    const { items, allOk } = await checkOrgFileAccess(loaded);
    return { isOwner, ownerEmail: loaded.ownerEmail, allOk, items };
  }),
});
