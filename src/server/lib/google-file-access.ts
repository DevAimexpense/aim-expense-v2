// ===========================================
// สิทธิ์เข้าถึงชีต/โฟลเดอร์ของ org (ใช้ร่วม: googleAccess router + OAuth callback re-grant)
//
// scope drive.file ผูกสิทธิ์ไฟล์กับ OAuth client ที่สร้างไฟล์ — org ที่สร้างก่อนย้าย
// Google client (2026-07-09) แอปมองไม่เห็นชีต/โฟลเดอร์เดิมแม้ token ยังดีอยู่
// อ่านแค่ metadata (ชื่อไฟล์/อยู่ในถังขยะไหม) ไม่อ่านข้อมูลธุรกิจ — ตามกฎ Zero Data Retention
// ===========================================

import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "@/server/services/google-drive.service";
import { getOrgAccessToken } from "@/server/lib/sheets-context";

/** cookie + state ของ flow ยืนยันสิทธิ์ (GET /api/auth/google/regrant → callback) */
export const REGRANT_COOKIE = "aim-g-regrant";
export const REGRANT_STATE_PREFIX = "regrant:";

export type FileItemKey = "sheet" | "root" | "receipts" | "documents" | "reports";
export type FileItemStatus = "ok" | "trashed" | "no_access" | "missing_id";

const ITEM_LABELS: Record<FileItemKey, string> = {
  sheet: "Master Spreadsheet",
  root: "โฟลเดอร์หลัก",
  receipts: "โฟลเดอร์ใบเสร็จ",
  documents: "โฟลเดอร์เอกสาร",
  reports: "โฟลเดอร์รายงาน",
};

export async function loadOrgFiles(orgId: string) {
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
  const ids: Record<FileItemKey, string | null> = {
    sheet: org.googleSpreadsheetId,
    root: org.googleDriveFolderId,
    receipts: org.driveReceiptsFolderId,
    documents: org.driveDocumentsFolderId,
    reports: org.driveReportsFolderId,
  };
  return { ownerId: org.ownerId, ownerEmail: org.owner.googleConnection?.googleEmail ?? null, ids };
}

export type LoadedOrgFiles = Awaited<ReturnType<typeof loadOrgFiles>>;

/** ตรวจทีละรายการด้วย token เจ้าของ (โยน TRPCError ไทยถ้า token ถูกยกเลิก/ยังไม่เชื่อมต่อ) */
export async function checkOrgFileAccess(loaded: LoadedOrgFiles) {
  const { ownerId, ids } = loaded;
  const token = await getOrgAccessToken(ownerId);
  const drive = new GoogleDriveService(token);
  const keys = Object.keys(ids) as FileItemKey[];
  const items = await Promise.all(
    keys.map(async (key) => {
      const id = ids[key];
      // โฟลเดอร์ย่อยที่ไม่มี id = ใช้โฟลเดอร์หลักแทน (getDriveService fallback) ไม่ใช่ปัญหา
      if (!id) return { key, label: ITEM_LABELS[key], status: "missing_id" as FileItemStatus };
      const r = await drive.getFileAccess(id);
      return { key, label: ITEM_LABELS[key], status: r.status as FileItemStatus };
    }),
  );
  const required = items.filter((i) => i.key === "sheet" || i.key === "root" || i.status !== "missing_id");
  const allOk = required.every((i) => i.status === "ok");
  return { items, allOk };
}

/** file id ทั้งหมดของ org (ไม่ซ้ำ) — ส่งให้ Google Picker แสดงเฉพาะไฟล์ของธุรกิจนี้ */
export function orgFileIds(loaded: LoadedOrgFiles): string[] {
  return Array.from(new Set(Object.values(loaded.ids).filter((v): v is string => !!v)));
}
