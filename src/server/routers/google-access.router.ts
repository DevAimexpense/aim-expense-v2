// ===========================================
// Aim Expense — สิทธิ์เข้าถึงชีต/โฟลเดอร์เดิมของ org (Google Picker re-grant)
//
// scope drive.file ผูกสิทธิ์ไฟล์กับ OAuth client ที่สร้างไฟล์ — org ที่สร้างก่อนย้าย
// Google client (2026-07-09) แอปมองไม่เห็นชีต/โฟลเดอร์เดิมแม้ token ยังดีอยู่
// เจ้าของ org เปิด Google Picker (หน้า ตั้งค่า › เชื่อมต่อ Google) แล้วเลือกไฟล์เดิม
// → Google ให้สิทธิ์ drive.file กับไฟล์เหล่านั้นแก่แอปอีกครั้ง ข้อมูลเดิมใช้ต่อได้ครบ
//
// อ่านแค่ metadata (ชื่อไฟล์/อยู่ในถังขยะไหม) ไม่อ่านข้อมูลธุรกิจ — ตามกฎ Zero Data Retention
// ===========================================

import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "../services/google-drive.service";
import { getOrgAccessToken, invalidateOrgInfoCache } from "../lib/sheets-context";
import { safeAuditLog } from "@/server/lib/audit";

type ItemKey = "sheet" | "root" | "receipts" | "documents" | "reports";
type ItemStatus = "ok" | "trashed" | "no_access" | "missing_id";

const ITEM_LABELS: Record<ItemKey, string> = {
  sheet: "Master Spreadsheet",
  root: "โฟลเดอร์หลัก",
  receipts: "โฟลเดอร์ใบเสร็จ",
  documents: "โฟลเดอร์เอกสาร",
  reports: "โฟลเดอร์รายงาน",
};

async function loadOrgFiles(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      ownerId: true,
      googleSpreadsheetId: true,
      googleDriveFolderId: true,
      driveReceiptsFolderId: true,
      driveDocumentsFolderId: true,
      driveReportsFolderId: true,
      owner: { select: { googleConnection: { select: { googleEmail: true } } } },
    },
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัท" });
  const ids: Record<ItemKey, string | null> = {
    sheet: org.googleSpreadsheetId,
    root: org.googleDriveFolderId,
    receipts: org.driveReceiptsFolderId,
    documents: org.driveDocumentsFolderId,
    reports: org.driveReportsFolderId,
  };
  return { ownerId: org.ownerId, ownerEmail: org.owner.googleConnection?.googleEmail ?? null, ids };
}

/** ตรวจทีละรายการด้วย token เจ้าของ (โยน TRPCError ไทยถ้า token ถูกยกเลิก/ยังไม่เชื่อมต่อ) */
async function checkAccess(loaded: Awaited<ReturnType<typeof loadOrgFiles>>) {
  const { ownerId, ownerEmail, ids } = loaded;
  const token = await getOrgAccessToken(ownerId);
  const drive = new GoogleDriveService(token);
  const keys = Object.keys(ids) as ItemKey[];
  const items = await Promise.all(
    keys.map(async (key) => {
      const id = ids[key];
      // โฟลเดอร์ย่อยที่ไม่มี id = ใช้โฟลเดอร์หลักแทน (getDriveService fallback) ไม่ใช่ปัญหา
      if (!id) return { key, label: ITEM_LABELS[key], status: "missing_id" as ItemStatus, name: null };
      const r = await drive.getFileAccess(id);
      return { key, label: ITEM_LABELS[key], status: r.status as ItemStatus, name: r.name ?? null };
    }),
  );
  const required = items.filter((i) => i.key === "sheet" || i.key === "root" || i.status !== "missing_id");
  const allOk = required.every((i) => i.status === "ok");
  return { ownerId, ownerEmail, ids, items, allOk };
}

function assertAdminOrOwner(role: string, isOwner: boolean) {
  if (role !== "admin" && !isOwner) {
    throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลหรือเจ้าของธุรกิจ" });
  }
}

export const googleAccessRouter = router({
  /** สถานะสิทธิ์ของชีต + โฟลเดอร์ (ผู้ดูแล/เจ้าของ) */
  status: orgProcedure.query(async ({ ctx }) => {
    const loaded = await loadOrgFiles(ctx.org.orgId);
    const isOwner = loaded.ownerId === ctx.session.userId;
    assertAdminOrOwner(ctx.org.role, isOwner);
    const { ownerEmail, items, allOk } = await checkAccess(loaded);
    return {
      isOwner,
      ownerEmail,
      allOk,
      items: items.map(({ key, label, status, name }) => ({ key, label, status, name })),
      pickerConfigured: !!process.env.GOOGLE_PICKER_API_KEY,
    };
  }),

  /**
   * ค่าสำหรับเปิด Google Picker — เจ้าของ org เท่านั้น (token ใน Picker = token ของเจ้าของเอง
   * ส่งกลับไปที่เบราว์เซอร์ของเจ้าของเองเท่านั้น)
   */
  pickerConfig: orgProcedure.mutation(async ({ ctx }) => {
    const { ownerId, ownerEmail, ids } = await loadOrgFiles(ctx.org.orgId);
    if (ownerId !== ctx.session.userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `เจ้าของธุรกิจ${ownerEmail ? ` (${ownerEmail})` : ""}ต้องเป็นคนยืนยันสิทธิ์ชีตเดิมเอง`,
      });
    }
    const developerKey = process.env.GOOGLE_PICKER_API_KEY;
    if (!developerKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "ระบบยังไม่ได้เปิดใช้ Google Picker — กรุณาติดต่อทีม Aim Expense",
      });
    }
    // App ID = เลข Cloud project (ส่วนหน้าของ client ID) — ให้ Picker มอบสิทธิ์ไฟล์ให้แอปนี้
    const appId =
      process.env.GOOGLE_PICKER_APP_ID || (process.env.GOOGLE_CLIENT_ID ?? "").split("-")[0];
    const accessToken = await getOrgAccessToken(ownerId);
    const fileIds = Object.values(ids).filter((v): v is string => !!v);
    return { accessToken, developerKey, appId, fileIds, ownerEmail };
  }),

  /** หลังเลือกไฟล์ใน Picker — ตรวจซ้ำ + บันทึก audit (เจ้าของเท่านั้น) */
  confirmRegrant: orgProcedure.mutation(async ({ ctx }) => {
    const loaded = await loadOrgFiles(ctx.org.orgId);
    if (loaded.ownerId !== ctx.session.userId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะเจ้าของธุรกิจ" });
    }
    const { ownerEmail, items, allOk } = await checkAccess(loaded);
    invalidateOrgInfoCache(ctx.org.orgId);
    await safeAuditLog({
      orgId: ctx.org.orgId,
      userId: ctx.session.userId,
      action: allOk ? "google_files_regranted" : "google_files_regrant_partial",
      entityType: "organization",
      entityRef: ctx.org.orgId,
      summary: items.map((i) => `${i.key}:${i.status}`).join(" "),
    });
    return {
      isOwner: true,
      ownerEmail,
      allOk,
      items: items.map(({ key, label, status, name }) => ({ key, label, status, name })),
      pickerConfigured: true,
    };
  }),
});
