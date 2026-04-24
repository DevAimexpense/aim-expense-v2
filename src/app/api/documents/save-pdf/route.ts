// ===========================================
// POST /api/documents/save-pdf
// รับ PDF ที่ client generate ไว้ → อัปโหลดไป Drive (Documents/YYYY/MM/)
//   → update GeneratedDocUrl + GeneratedDocType ใน PAYMENTS sheet
//
// Input (FormData):
//   - file: PDF blob
//   - paymentId: string
//   - docType: "wht-cert" | "substitute-receipt" | "receipt-voucher"
//   - docDate: ISO YYYY-MM-DD (วันที่ออกเอกสาร — ใช้จัด folder)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, getDriveService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";

const DOC_TYPE_LABEL: Record<string, string> = {
  "wht-cert": "หนังสือรับรองหัก ณ ที่จ่าย",
  "substitute-receipt": "ใบรับรองแทนใบเสร็จ",
  "receipt-voucher": "ใบสำคัญรับเงิน",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getOrgContext(session.userId);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const paymentId = formData.get("paymentId") as string | null;
    const docType = formData.get("docType") as string | null;
    const docDate = (formData.get("docDate") as string) || new Date().toISOString().slice(0, 10);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์ PDF" }, { status: 400 });
    }
    if (!paymentId) {
      return NextResponse.json({ error: "ต้องระบุ paymentId" }, { status: 400 });
    }
    if (!docType || !(docType in DOC_TYPE_LABEL)) {
      return NextResponse.json({ error: "docType ไม่ถูกต้อง" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 20 MB" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "ต้องเป็น PDF เท่านั้น" }, { status: 400 });
    }

    console.log(`[save-pdf] paymentId=${paymentId} docType=${docType} size=${file.size}`);

    // Get payment for description (ใช้ใน filename)
    const sheets = await getSheetsService(org.orgId);
    await sheets.ensureAllTabsExist();
    const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (!payment) {
      return NextResponse.json({ error: "ไม่พบรายการจ่าย" }, { status: 404 });
    }

    // DEDUP — ถ้า payment มี GeneratedDocUrl (doctype เดียวกัน) อยู่แล้ว → return existing
    // กัน: Strict Mode double-run, user reload หน้า ?auto=1 ซ้ำ, race condition
    if (payment.GeneratedDocUrl && payment.GeneratedDocType === docType) {
      console.log(`[save-pdf] DEDUP hit — return existing ${payment.GeneratedDocUrl}`);
      return NextResponse.json({
        success: true,
        fileUrl: payment.GeneratedDocUrl,
        fileName: "(existing)",
        folderPath: "",
        deduped: true,
      });
    }

    const description = payment.Description || DOC_TYPE_LABEL[docType];

    // Get drive service + documents folder
    const { drive, documentsFolderId } = await getDriveService(org.orgId);

    // Buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Upload ไป Documents/{YYYY}/{MM}/
    const result = await drive.uploadSystemDocument({
      documentsFolderId,
      docDate,
      paymentId,
      docType,
      description,
      fileBuffer,
    });

    // Update payment record
    await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId, {
      GeneratedDocUrl: result.webViewLink,
      GeneratedDocType: docType,
      UpdatedAt: new Date().toISOString(),
    });

    await prisma.auditLog.create({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "save_document",
        entityType: "payment",
        entityRef: paymentId,
        summary: `บันทึก ${DOC_TYPE_LABEL[docType]} PDF → ${result.folderPath}/${result.fileName}`,
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl: result.webViewLink,
      fileName: result.fileName,
      folderPath: result.folderPath,
    });
  } catch (err) {
    console.error("[save-pdf]", err);
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
