// ===========================================
// POST /api/tax-invoices/upload
// Upload payment evidence or WHT certificate for a tax invoice → Google Drive
//
// Folder: Receipts/{YYYY}/{MM}/  (uses paidDate or docDate to bucket)
// Filename: {YYYYMMDD}_{evidence|whtcert}_{docNumber}_{taxInvoiceId}.{ext}
//
// After upload, writes the URL back to the TI row via the service layer
// (PaymentEvidenceUrl or WHTCertUrl column). Idempotent — re-upload overwrites
// the URL on the row but keeps the previous Drive file (Drive doesn't dedupe).
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
  const org = await getOrgContext(session.userId);
  if (!org) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const taxInvoiceId = formData.get("taxInvoiceId") as string | null;
    const fileType = formData.get("fileType") as string | null;
    const paidDateInput = (formData.get("paidDate") as string) || "";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }
    if (!taxInvoiceId) {
      return NextResponse.json(
        { error: "ต้องระบุ taxInvoiceId" },
        { status: 400 },
      );
    }
    if (fileType !== "evidence" && fileType !== "whtCert") {
      return NextResponse.json(
        { error: "fileType ต้องเป็น evidence หรือ whtCert" },
        { status: 400 },
      );
    }

    const sheets = await getSheetsService(org.orgId);
    await ensureTabsCached(sheets, org.orgId);
    const ti = await sheets.getTaxInvoiceById(taxInvoiceId);
    if (!ti) {
      return NextResponse.json(
        { error: "ไม่พบใบกำกับภาษี" },
        { status: 404 },
      );
    }
    if (ti.Status !== "issued") {
      return NextResponse.json(
        { error: `อัปโหลดได้เฉพาะใบกำกับภาษีที่ออกแล้ว (issued) — ปัจจุบัน ${ti.Status}` },
        { status: 400 },
      );
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
    const refDate = paidDateInput || ti.DocDate || new Date().toISOString().slice(0, 10);

    // Build folder path Receipts/{YYYY}/{MM}
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
    const docTag = ti.DocNumber || taxInvoiceId;
    const sanitize = (s: string) =>
      s
        .replace(/[^\w฀-๿-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
    const fileName = `${datePrefix}_${fileType === "evidence" ? "ti-evidence" : "ti-whtcert"}_${sanitize(docTag)}_${taxInvoiceId}.${ext}`;
    const folderPath = `Receipts/${year}/${paddedMonth}`;

    console.log(
      `[ti-upload] taxInvoiceId=${taxInvoiceId} fileType=${fileType} → ${folderPath}/${fileName}`,
    );

    const result = await drive.uploadFile(
      monthFolderId,
      fileName,
      file.type,
      fileBuffer,
    );

    // Write URL back to TI
    const updates: Record<string, string> = {
      UpdatedAt: new Date().toISOString(),
    };
    if (fileType === "evidence") {
      updates.PaymentEvidenceUrl = result.webViewLink;
    } else {
      updates.WHTCertUrl = result.webViewLink;
    }
    await sheets.updateById(
      SHEET_TABS.TAX_INVOICES,
      "TaxInvoiceID",
      taxInvoiceId,
      updates,
    );

    await prisma.auditLog.create({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "upload",
        entityType: "tax_invoice",
        entityRef: taxInvoiceId,
        summary: `อัปโหลด${fileType === "evidence" ? "หลักฐานการโอน" : "ใบหัก ณ ที่จ่าย"} ${ti.DocNumber || ""} → ${folderPath}/${fileName}`,
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl: result.webViewLink,
      fileName,
      folderPath,
    });
  } catch (err) {
    console.error("[ti-upload]", err);
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
