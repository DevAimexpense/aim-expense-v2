// ===========================================
// POST /api/payments/upload
// Upload payment file (invoice or receipt) to Google Drive
//
// โครงสร้าง folder: Receipts/{YYYY}/{MM}/
//   YYYY/MM คือปี/เดือนจาก receiptDate (วันที่ใบเสร็จ/ใบกำกับ)
//   ถ้าไม่ระบุ → fallback ไปที่ ReceiptDate ใน Sheets → DueDate → วันนี้
//
// ชื่อไฟล์: {YYYYMMDD}_{description}_{paymentId}.{ext}
//   paymentId เป็น unique key → ผูกไฟล์กับ payment record ได้
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, getDriveService } from "@/server/lib/sheets-context";
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
    const paymentId = formData.get("paymentId") as string | null;
    const fileType = formData.get("fileType") as string | null;
    const invoiceNumber = (formData.get("invoiceNumber") as string) || "";
    // รับ overrides จาก client: receiptDate + description
    //   - receiptDate: วันที่ใบเสร็จ/ใบกำกับ (ISO YYYY-MM-DD) → ใช้จัด folder + prefix ชื่อไฟล์
    //   - description: รายละเอียดรายจ่าย → ใส่ในชื่อไฟล์ให้ค้นเจอง่าย
    const clientReceiptDate = (formData.get("receiptDate") as string) || "";
    const clientDescription = (formData.get("description") as string) || "";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }
    if (!paymentId) {
      return NextResponse.json({ error: "ต้องระบุ paymentId" }, { status: 400 });
    }
    if (fileType !== "invoice" && fileType !== "receipt") {
      return NextResponse.json({ error: "fileType ต้องเป็น invoice หรือ receipt" }, { status: 400 });
    }

    console.log(`[upload] paymentId=${paymentId} fileType=${fileType} size=${file.size}`);

    // Get payment info (for project + payee + fallback dates)
    const sheets = await getSheetsService(org.orgId);
    await sheets.ensureAllTabsExist();
    const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (!payment) {
      console.error(`[upload] payment not found: ${paymentId}`);
      return NextResponse.json({ error: "ไม่พบรายการจ่าย" }, { status: 404 });
    }

    const event = await sheets.getEventById(payment.EventID);
    const payee = await sheets.getPayeeById(payment.PayeeID);

    // Resolve วันที่ใบเสร็จ/ใบกำกับ — priority:
    //   1. client-provided receiptDate (จาก form ตอน upload)
    //   2. payment.ReceiptDate ใน Sheets (ถ้า record receipt ไว้แล้ว)
    //   3. payment.DueDate
    //   4. วันนี้
    const receiptDate =
      clientReceiptDate ||
      payment.ReceiptDate ||
      payment.DueDate ||
      new Date().toISOString().slice(0, 10);

    // Description สำหรับชื่อไฟล์: client → payment.Description → payee name → "expense"
    const description =
      clientDescription ||
      payment.Description ||
      payee?.PayeeName ||
      "expense";

    // Get drive service
    const { drive, receiptsFolderId, orgName } = await getDriveService(org.orgId);

    // Upload
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Security: verify magic bytes + size + MIME
    try {
      validateUploadedFile({ type: file.type, size: file.size }, fileBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ไฟล์ไม่ถูกต้อง";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const result = await drive.uploadPaymentFile({
      receiptsFolderId,
      orgName,
      receiptDate,
      paymentId,
      description,
      projectName: event?.EventName || "NoProject",
      payeeName: payee?.PayeeName || "NoPayee",
      invoiceNumber: invoiceNumber || undefined,
      fileType,
      fileName: file.name,
      mimeType: file.type,
      fileBuffer,
    });

    // Update payment record with URL + sync ReceiptDate ถ้า client ส่งมา
    const updates: Record<string, string | number> = {
      UpdatedAt: new Date().toISOString(),
    };
    if (fileType === "invoice") {
      updates.InvoiceFileURL = result.webViewLink;
      if (invoiceNumber) updates.InvoiceNumber = invoiceNumber;
    } else {
      updates.ReceiptURL = result.webViewLink;
      if (clientReceiptDate) updates.ReceiptDate = clientReceiptDate;
      if (invoiceNumber) updates.ReceiptNumber = invoiceNumber;
    }

    await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId, updates);

    await prisma.auditLog.create({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "upload",
        entityType: "payment",
        entityRef: paymentId,
        summary: `อัปโหลด${fileType === "invoice" ? "ใบแจ้งหนี้" : "ใบเสร็จ"} → ${result.folderPath}/${result.fileName}`,
      },
    });

    return NextResponse.json({
      success: true,
      fileUrl: result.webViewLink,
      fileName: result.fileName,
      folderPath: result.folderPath,
    });
  } catch (err) {
    console.error("[payment upload]", err);
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
