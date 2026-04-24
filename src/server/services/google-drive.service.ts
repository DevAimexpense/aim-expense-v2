// ===========================================
// Aim Expense — Google Drive Service
// จัดการ folder + upload ใบเสร็จใน Drive ของ user
// ===========================================

import { google, drive_v3 } from "googleapis";
import { Readable } from "stream"; // static import — หลีกเลี่ยง dynamic import ที่อาจ return undefined ใน Next.js runtime

/**
 * GoogleDriveService
 * ใช้ owner's OAuth token เพื่อ access Google Drive
 */
export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: "v3", auth });
  }

  /**
   * สร้าง root folder สำหรับ org + sub-folders
   * Returns IDs of root + sub-folders
   */
  async createOrgFolder(orgName: string): Promise<{
    rootId: string;
    receiptsId: string;
    documentsId: string;
    reportsId: string;
  }> {
    const folder = await this.drive.files.create({
      requestBody: {
        name: `Aim Expense — ${orgName}`,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });

    const rootId = folder.data.id!;

    // สร้าง sub-folders พร้อมกัน
    const [receiptsId, documentsId, reportsId] = await Promise.all([
      this.createSubFolder(rootId, "Receipts"),
      this.createSubFolder(rootId, "Documents"),
      this.createSubFolder(rootId, "Reports"),
    ]);

    return { rootId, receiptsId, documentsId, reportsId };
  }

  /**
   * สร้าง/ดึง folder Year → Month (nested) ใน Receipts
   * โครงสร้าง: Receipts/{YYYY}/{MM}/
   * เช่น Receipts/2026/04/
   */
  async getOrCreateYearMonthFolder(
    receiptsFolderId: string,
    year: number,
    month: number
  ): Promise<string> {
    const yearName = String(year);
    const paddedMonth = String(month).padStart(2, "0");

    // Step 1: Year folder
    let yearFolderId = await this.getSubFolderId(receiptsFolderId, yearName);
    if (!yearFolderId) {
      yearFolderId = await this.createSubFolder(receiptsFolderId, yearName);
    }

    // Step 2: Month folder (inside year)
    let monthFolderId = await this.getSubFolderId(yearFolderId, paddedMonth);
    if (!monthFolderId) {
      monthFolderId = await this.createSubFolder(yearFolderId, paddedMonth);
    }

    return monthFolderId;
  }

  /**
   * Upload file สำหรับ payment (invoice หรือ receipt)
   *
   * โครงสร้าง folder: Receipts/{YYYY}/{MM}/ (ตามวันที่ใบเสร็จ/ใบกำกับ)
   * Format ชื่อไฟล์: {YYYYMMDD}_{description}_{paymentId}.{ext}
   *   เช่น 20260414_ค่าอาหาร_PMT_1234567_ABC.pdf
   */
  async uploadPaymentFile(params: {
    receiptsFolderId: string;
    orgName: string;
    /** วันที่ใบเสร็จ/ใบกำกับ (ISO YYYY-MM-DD) — ใช้จัด folder + prefix ชื่อไฟล์ */
    receiptDate: string;
    /** Unique key ของ payment record — ใช้ผูกไฟล์กับ record */
    paymentId: string;
    /** รายละเอียดรายจ่าย (จาก Payment.Description) — สำหรับชื่อไฟล์ */
    description: string;
    projectName: string;
    payeeName: string;
    invoiceNumber?: string;
    fileType: "invoice" | "receipt";
    fileName: string; // original filename (for extension)
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<{ fileId: string; webViewLink: string; fileName: string; folderPath: string }> {
    // Parse date → year/month/day (fallback = today ถ้า parse ไม่ได้)
    let date = new Date(params.receiptDate);
    if (isNaN(date.getTime())) {
      console.warn(`[drive] invalid receiptDate "${params.receiptDate}", using today`);
      date = new Date();
    }
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");
    const datePrefix = `${year}${paddedMonth}${paddedDay}`;

    // Get or create Year/Month folder (nested)
    const monthFolderId = await this.getOrCreateYearMonthFolder(
      params.receiptsFolderId,
      year,
      month
    );

    // Generate filename: YYYYMMDD_description_paymentId.ext
    const ext = (params.fileName.split(".").pop() || "pdf").toLowerCase();
    // sanitize: เก็บได้ทั้งตัวอักษรไทย/อังกฤษ/ตัวเลข/_/- (ตัด char พิเศษอื่น ๆ)
    const sanitize = (s: string) =>
      s.replace(/[^\w\u0E00-\u0E7F-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const descPart = sanitize(params.description || params.payeeName || "expense");
    const idPart = params.paymentId; // paymentId เป็น unique key อยู่แล้ว — ไม่ sanitize
    const finalFileName = `${datePrefix}_${descPart}_${idPart}.${ext}`;
    const folderPath = `Receipts/${year}/${paddedMonth}`;

    console.log(`[drive] uploading to ${folderPath}/${finalFileName}`);

    const result = await this.uploadFile(
      monthFolderId,
      finalFileName,
      params.mimeType,
      params.fileBuffer
    );

    console.log(`[drive] uploaded → ${result.webViewLink}`);

    return { ...result, fileName: finalFileName, folderPath };
  }

  /**
   * Upload system-generated PDF (WHT cert, substitute-receipt, receipt-voucher)
   * โครงสร้าง folder: Documents/{YYYY}/{MM}/
   * ชื่อไฟล์: {YYYYMMDD}_{docType}_{description}_{paymentId}.pdf
   */
  async uploadSystemDocument(params: {
    documentsFolderId: string;
    docDate: string; // ISO YYYY-MM-DD
    paymentId: string;
    docType: string; // "wht-cert" | "substitute-receipt" | "receipt-voucher"
    description: string;
    fileBuffer: Buffer;
  }): Promise<{ fileId: string; webViewLink: string; fileName: string; folderPath: string }> {
    let date = new Date(params.docDate);
    if (isNaN(date.getTime())) date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");
    const datePrefix = `${year}${paddedMonth}${paddedDay}`;

    // Get/create Year/Month folder ภายใต้ Documents/
    const monthFolderId = await this.getOrCreateYearMonthFolder(
      params.documentsFolderId,
      year,
      month
    );

    // Filename: YYYYMMDD_docType_desc_paymentId.pdf
    const sanitize = (s: string) =>
      s.replace(/[^\w\u0E00-\u0E7F-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const descPart = sanitize(params.description || "doc");
    const fileName = `${datePrefix}_${params.docType}_${descPart}_${params.paymentId}.pdf`;
    const folderPath = `Documents/${year}/${paddedMonth}`;

    console.log(`[drive-sys-doc] uploading ${folderPath}/${fileName}`);

    const result = await this.uploadFile(
      monthFolderId,
      fileName,
      "application/pdf",
      params.fileBuffer
    );

    console.log(`[drive-sys-doc] uploaded → ${result.webViewLink}`);

    return { ...result, fileName, folderPath };
  }

  /**
   * สร้าง sub-folder
   */
  private async createSubFolder(
    parentId: string,
    name: string
  ): Promise<string> {
    const folder = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
    });
    return folder.data.id!;
  }

  /**
   * Upload ไฟล์ (ใบเสร็จ/เอกสาร)
   */
  async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer
  ): Promise<{ fileId: string; webViewLink: string }> {
    // ใช้ Readable จาก static import ด้านบน — แก้ bug "reading 'from'"
    // (dynamic import บางครั้ง return undefined ใน Next.js serverless build)
    const file = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: "id, webViewLink",
    });

    return {
      fileId: file.data.id!,
      webViewLink: file.data.webViewLink!,
    };
  }

  /**
   * ดึง sub-folder ID (เช่น Receipts folder)
   */
  async getSubFolderId(
    parentId: string,
    folderName: string
  ): Promise<string | null> {
    const response = await this.drive.files.list({
      q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });

    return response.data.files?.[0]?.id || null;
  }

  /**
   * List files in a folder
   */
  async listFiles(
    folderId: string
  ): Promise<{ id: string; name: string; webViewLink: string }[]> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, webViewLink, mimeType, size, createdTime)",
      orderBy: "createdTime desc",
    });

    return (response.data.files || []).map((f) => ({
      id: f.id!,
      name: f.name!,
      webViewLink: f.webViewLink || "",
    }));
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }
}
