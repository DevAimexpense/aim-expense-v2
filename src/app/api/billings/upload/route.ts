// ===========================================
// POST /api/billings/upload
// Upload a withholding-tax certificate (50ทวิ) for a billing/income row → Google Drive
//
// Used by the personal "บันทึกรายรับ" flow: the payer issues a WHT cert which
// the individual attaches to the income record. Mirrors the tax-invoice upload.
//
// Folder: Receipts/{YYYY}/{MM}/  (uses the billing DocDate to bucket)
// Filename: {YYYYMMDD}_bil-whtcert_{docNumber}_{billingId}.{ext}
// Writes the URL back to the Billings row (WHTCertUrl column).
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import {
  getSheetsService,
  getDriveService,
  ensureTabsCached,
} from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { validateUploadedFile } from "@/lib/security/file-validation";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const billingId = formData.get("billingId") as string | null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }
    if (!billingId) {
      return NextResponse.json({ error: "ต้องระบุ billingId" }, { status: 400 });
    }

    const sheets = await getSheetsService(org.orgId);
    await ensureTabsCached(sheets, org.orgId);
    const billing = await sheets.getBillingById(billingId);
    if (!billing) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    try {
      validateUploadedFile({ type: file.type, size: file.size }, fileBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ไฟล์ไม่ถูกต้อง";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { drive, receiptsFolderId } = await getDriveService(org.orgId);
    const refDate =
      billing.DocDate || new Date().toISOString().slice(0, 10);

    let date = new Date(refDate);
    if (isNaN(date.getTime())) date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");
    const datePrefix = `${year}${paddedMonth}${paddedDay}`;

    const monthFolderId = await drive.getOrCreateYearMonthFolder(
      receiptsFolderId,
      year,
      month,
    );

    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const docTag = billing.DocNumber || billingId;
    const sanitize = (s: string) =>
      s
        .replace(/[^\w฀-๿-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
    const fileName = `${datePrefix}_bil-whtcert_${sanitize(docTag)}_${billingId}.${ext}`;
    const folderPath = `Receipts/${year}/${paddedMonth}`;

    const result = await drive.uploadFile(
      monthFolderId,
      fileName,
      file.type,
      fileBuffer,
    );

    await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", billingId, {
      WHTCertUrl: result.webViewLink,
      UpdatedAt: new Date().toISOString(),
    });

    await prisma.auditLog.create({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "upload",
        entityType: "billing",
        entityRef: billingId,
        summary: `อัปโหลดใบหัก ณ ที่จ่าย ${billing.DocNumber || ""} → ${folderPath}/${fileName}`,
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl: result.webViewLink,
      fileName,
      folderPath,
    });
  } catch (err) {
    console.error("[billing-upload]", err);
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
