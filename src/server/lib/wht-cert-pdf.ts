// ===========================================
// หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — สร้าง PDF + บันทึกลง Drive อัตโนมัติจากฝั่ง server
//
// spec: เอกสารระบบต้องบันทึกลง Drive อัตโนมัติทั้งหมด — เดิมพึ่ง hidden iframe ในเบราว์เซอร์
// (fireAutoGenDoc) จึงไม่ทำงานในทางที่ไม่มีเบราว์เซอร์ (LINE) หรือหน้าที่ไม่ได้สั่ง
// ตอนนี้ 50 ทวิ เป็น vector PDF (pdf-lib) สร้างบน server ได้เลย → เรียก autoSaveWhtCert
// หลังทุก mutation ที่ทำให้รายการมีหัก ณ ที่จ่าย + วันที่จ่าย/วันที่ใบเสร็จ
// ===========================================

import { generateWhtCertPdf } from "@/lib/wht-cert/generate";
import { loadWhtCertData, WhtCertNoDateError, WhtCertNotPaidError, type WhtCertData } from "@/server/lib/wht-cert-data";
import { getSheetsService, getDriveService, ensureTabsCached } from "@/server/lib/sheets-context";
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

/** ชื่อไฟล์แบบเดียวกับ GoogleDriveService.uploadSystemDocument: YYYYMMDD_type_desc_id.pdf */
function systemDocFileName(docDate: string, docType: string, description: string, paymentId: string): string {
  let d = new Date(docDate);
  if (isNaN(d.getTime())) d = new Date();
  const prefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const desc =
    description.replace(/[^\w\u0E00-\u0E7F-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "doc";
  return `${prefix}_${docType}_${desc}_${paymentId}.pdf`;
}

/** สถานะที่ถือว่าจ่ายเงินแล้ว (หักภาษีเกิดขึ้นจริง) */
const PAID_STATUSES = new Set(["paid", "cleared"]);

/**
 * เหตุที่ไม่บันทึก 50 ทวิ อัตโนมัติ (null = บันทึกได้) — แยกเป็นฟังก์ชันล้วนให้เทสต์ได้
 * ลำดับ: ไม่มี WHT → ยังไม่จ่าย (WHT-01) → มีไฟล์แล้ว (dedup เหมือน save-pdf) → มีเอกสารระบบอื่นในช่องเดียวกัน
 */
type WhtPaymentRow = {
  WTHAmount?: string;
  PctWTH?: string;
  TTLAmount?: string;
  PayeeID?: string;
  PaymentDate?: string;
  ReceiptDate?: string;
  Description?: string;
  Status?: string;
  GeneratedDocUrl?: string;
  GeneratedDocType?: string;
  WhtCertFor?: string;
  WthTypeId?: string;
};

/**
 * WHT-03: ลายนิ้วมือของข้อมูลที่พิมพ์อยู่บน 50 ทวิ — ไม่ใช้ UpdatedAt เพราะเปลี่ยนจากเรื่องอื่น
 * (แนบไฟล์/เคลียร์งบ) ด้วย จะทำให้สร้างไฟล์ใหม่โดยไม่จำเป็น
 * (ชื่อ/ที่อยู่ในทะเบียนผู้รับเงินไม่อยู่ในนี้ — แก้ทะเบียนแล้วเปิดหน้า 50 ทวิ จะเห็นฉบับใหม่ แต่ไฟล์ใน Drive คงเดิม)
 */
export function whtCertSignature(p: WhtPaymentRow): string {
  const base = [p.WTHAmount, p.PctWTH, p.TTLAmount, p.PayeeID, p.PaymentDate, p.ReceiptDate, p.Description]
    .map((v) => String(v ?? "").trim())
    .join("|");
  // WHT-19: ประเภทเงินได้พิมพ์บนใบ → เปลี่ยนประเภท = ฉบับใหม่ · ต่อท้ายเฉพาะเมื่อมีค่า
  // (แถวเก่าที่ไม่มี WthTypeId ได้ลายนิ้วมือเดิม → ไม่เกิด _v2 ทั้งชีตหลัง deploy)
  const typeId = String(p.WthTypeId ?? "").trim();
  return typeId ? `${base}|${typeId}` : base;
}

export function whtAutoSaveSkipReason(payment: WhtPaymentRow): "no_wht" | "not_paid" | "exists" | "other_doc" | null {
  if (!((parseFloat(payment.WTHAmount || "") || 0) > 0)) return "no_wht";
  // WHT-01: ออกเฉพาะรายการที่จ่ายเงินแล้ว — รายการรออนุมัติ (เช่นจาก LINE ที่มีวันที่ใบเสร็จ)
  // ถ้าออกตอนนี้จะใช้เลข 50 ทวิ ไปก่อน (ไม่อนุมัติ = เลขหาย) และลงวันที่ใบเสร็จแทนวันจ่ายจริง
  if (!PAID_STATUSES.has(payment.Status || "")) return "not_paid";
  if (payment.GeneratedDocUrl) {
    if (payment.GeneratedDocType !== "wht-cert") return "other_doc";
    // WHT-03: ไฟล์เดิมสร้างจากข้อมูลชุดนี้แล้ว → ใช้ต่อ · ไม่ตรง (แก้ยอด/วันที่ ฯลฯ) → ไฟล์เวอร์ชันใหม่ (CTRL-09)
    if ((payment.WhtCertFor || "") === whtCertSignature(payment)) return "exists";
  }
  return null;
}

export type AutoSaveWhtResult =
  | { status: "saved"; fileUrl: string }
  | { status: "exists"; fileUrl: string }
  | { status: "skipped"; reason: "no_wht" | "not_paid" | "no_date" | "not_found" | "other_doc" }
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
    // คอลัมน์ WhtCertFor ต้องมีในชีตก่อน — updateById ข้ามคอลัมน์ที่ไม่มีเงียบ ๆ (ไม่งั้นจะสร้างไฟล์ใหม่ทุกครั้ง)
    await ensureTabsCached(sheets, orgId);
    if (spreadsheetId) await invalidateTab(spreadsheetId, SHEET_TABS.PAYMENTS);
    const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (!payment) return { status: "skipped", reason: "not_found" };
    const skip = whtAutoSaveSkipReason(payment);
    if (skip === "exists") return { status: "exists", fileUrl: payment.GeneratedDocUrl };
    if (skip) return { status: "skipped", reason: skip };

    let data: WhtCertData | null;
    try {
      data = await loadWhtCertData(orgId, paymentId);
    } catch (e) {
      if (e instanceof WhtCertNoDateError) return { status: "skipped", reason: "no_date" };
      if (e instanceof WhtCertNotPaidError) return { status: "skipped", reason: "not_paid" };
      throw e;
    }
    if (!data) return { status: "skipped", reason: "not_found" };

    const bytes = await buildWhtCertPdf(data);
    const { drive, documentsFolderId } = await getDriveService(orgId);
    const description = payment.Description || "หนังสือรับรองหัก ณ ที่จ่าย";
    // WHT-03 + CTRL-09: มีไฟล์ 50 ทวิ แล้วแต่ข้อมูลเปลี่ยน → บันทึกเป็นไฟล์เวอร์ชันใหม่ (_v2 …) เลขเดิม
    // ไฟล์เดิมเก็บไว้ (ฉบับที่ให้ผู้รับเงินไปแล้วต้องไม่หาย) · GeneratedDocUrl ชี้ฉบับล่าสุด
    const replacing = payment.GeneratedDocType === "wht-cert" && !!payment.GeneratedDocUrl;
    const result = replacing
      ? await drive.uploadDocumentVersion({
          documentsFolderId,
          docDate: data.payment.paymentDate,
          fileName: systemDocFileName(data.payment.paymentDate, "wht-cert", description, paymentId),
          fileBuffer: Buffer.from(bytes),
          existingUrl: payment.GeneratedDocUrl,
        })
      : await drive.uploadSystemDocument({
          documentsFolderId,
          docDate: data.payment.paymentDate,
          paymentId,
          docType: "wht-cert",
          description,
          fileBuffer: Buffer.from(bytes),
        });
    await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId, {
      GeneratedDocUrl: result.webViewLink,
      GeneratedDocType: "wht-cert",
      WhtCertFor: whtCertSignature(payment),
    });
    await safeAuditLog({
      data: {
        orgId,
        userId,
        action: "save_document",
        entityType: "payment",
        entityRef: paymentId,
        summary: `บันทึก หนังสือรับรองหัก ณ ที่จ่าย PDF (อัตโนมัติ${replacing ? " · ฉบับแก้ไข — ไฟล์เดิมเก็บไว้" : ""}) → ${result.folderPath}/${result.fileName}`,
      },
    });
    return { status: "saved", fileUrl: result.webViewLink };
  }
}
