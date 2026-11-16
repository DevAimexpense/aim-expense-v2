// ===========================================
// หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — สร้าง PDF + บันทึกลง Drive อัตโนมัติจากฝั่ง server
//
// spec: เอกสารระบบต้องบันทึกลง Drive อัตโนมัติทั้งหมด — เดิมพึ่ง hidden iframe ในเบราว์เซอร์
// (fireAutoGenDoc) จึงไม่ทำงานในทางที่ไม่มีเบราว์เซอร์ (LINE) หรือหน้าที่ไม่ได้สั่ง
// ตอนนี้ 50 ทวิ เป็น vector PDF (pdf-lib) สร้างบน server ได้เลย → เรียก autoSaveWhtCert
// หลังทุก mutation ที่ทำให้รายการมีหัก ณ ที่จ่าย + วันที่จ่าย/วันที่ใบเสร็จ
// ===========================================

import { generateWhtCertPdf } from "@/lib/wht-cert/generate";
import { loadWhtCertData, WhtCertNoDateError, type WhtCertData } from "@/server/lib/wht-cert-data";
import { getSheetsService, getDriveService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { safeAuditLog } from "@/server/lib/audit";
import { withLock } from "@/server/lib/lock";
import { invalidateTab } from "@/server/lib/cache";

/** WhtCertData → PDF bytes (ใช้ร่วมกับ GET /api/documents/wht-cert/[paymentId]) */
export async function buildWhtCertPdf(data: WhtCertData): Promise<Uint8Array> {
  const withBranch = (name: string, branch: string) => (branch ? `${name} (${branch})` : name);
  return generateWhtCertPdf({
    bookNo: data.docNumber.book,
    docNo: data.docNumber.number,
    // ลำดับที่ในแบบ ภ.ง.ด. = ลำดับ running ของเดือน (ส่วนท้ายของเลขที่เอกสาร)
    sequenceNo: String(parseInt(data.docNumber.number.split("/")[1] || "1", 10) || 1),
    pndForm: data.pndForm,
    payer: {
      name: withBranch(data.payer.name, data.payer.branchInfo),
      taxId: data.payer.taxId,
      address: data.payer.address || "",
      signatureUrl: data.payer.signatureUrl,
    },
    payee: {
      name: withBranch(data.payee.name, data.payee.branchInfo),
      taxId: data.payee.taxId,
      address: data.payee.address || "",
    },
    incomeSection: data.incomeSection,
    incomeNote: [data.incomeLabel, data.payment.description].filter(Boolean).join(" — "),
    paidDate: data.payment.paymentDate,
    amount: data.payment.totalBeforeTax,
    tax: data.payment.wthAmount,
  });
}

export type AutoSaveWhtResult =
  | { status: "saved"; fileUrl: string }
  | { status: "exists"; fileUrl: string }
  | { status: "skipped"; reason: "no_wht" | "no_date" | "not_found" | "other_doc" }
  | { status: "error"; error: string };

/**
 * สร้าง 50 ทวิ แล้วบันทึกลง Drive (Documents/YYYY/MM) + เขียน GeneratedDocUrl — ไม่ throw
 * (งานหลักบันทึกไปแล้ว ห้ามล้มเพราะเอกสารประกอบ) · ข้ามถ้าไม่มี WHT / ยังไม่มีวันที่ / มีไฟล์แล้ว
 */
export async function autoSaveWhtCert(params: {
  orgId: string;
  paymentId: string;
  userId: string;
  spreadsheetId?: string | null;
}): Promise<AutoSaveWhtResult> {
  const { orgId, paymentId, userId } = params;
  try {
    // lock ต่อรายการ + อ่านสด — 2 mutation ติดกัน (หรือ server กับปุ่มในเบราว์เซอร์) ต้องไม่สร้างไฟล์ซ้ำ
    return await withLock(`whtcert:${orgId}:${paymentId}`, () => saveLocked(orgId, paymentId, userId, params.spreadsheetId), {
      ttlMs: 60_000,
    });
  } catch (err) {
    console.error("[wht-cert/auto-save]", paymentId, err);
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function saveLocked(
  orgId: string,
  paymentId: string,
  userId: string,
  spreadsheetId?: string | null,
): Promise<AutoSaveWhtResult> {
  {
    const sheets = await getSheetsService(orgId);
    if (spreadsheetId) await invalidateTab(spreadsheetId, SHEET_TABS.PAYMENTS);
    const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (!payment) return { status: "skipped", reason: "not_found" };
    if (!((parseFloat(payment.WTHAmount) || 0) > 0)) return { status: "skipped", reason: "no_wht" };
    // DEDUP เหมือน /api/documents/save-pdf — มีไฟล์ 50 ทวิ แล้วไม่สร้างซ้ำ
    if (payment.GeneratedDocUrl) {
      return payment.GeneratedDocType === "wht-cert"
        ? { status: "exists", fileUrl: payment.GeneratedDocUrl }
        : { status: "skipped", reason: "other_doc" };
    }

    let data: WhtCertData | null;
    try {
      data = await loadWhtCertData(orgId, paymentId);
    } catch (e) {
      if (e instanceof WhtCertNoDateError) return { status: "skipped", reason: "no_date" };
      throw e;
    }
    if (!data) return { status: "skipped", reason: "not_found" };

    const bytes = await buildWhtCertPdf(data);
    const { drive, documentsFolderId } = await getDriveService(orgId);
    const result = await drive.uploadSystemDocument({
      documentsFolderId,
      docDate: data.payment.paymentDate,
      paymentId,
      docType: "wht-cert",
      description: payment.Description || "หนังสือรับรองหัก ณ ที่จ่าย",
      fileBuffer: Buffer.from(bytes),
    });
    await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId, {
      GeneratedDocUrl: result.webViewLink,
      GeneratedDocType: "wht-cert",
      UpdatedAt: new Date().toISOString(),
    });
    await safeAuditLog({
      data: {
        orgId,
        userId,
        action: "save_document",
        entityType: "payment",
        entityRef: paymentId,
        summary: `บันทึก หนังสือรับรองหัก ณ ที่จ่าย PDF (อัตโนมัติ) → ${result.folderPath}/${result.fileName}`,
      },
    });
    return { status: "saved", fileUrl: result.webViewLink };
  }
}
