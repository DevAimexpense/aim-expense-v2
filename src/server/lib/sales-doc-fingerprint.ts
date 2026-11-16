// ===========================================
// CTRL-10: ลายนิ้วมือ "สิ่งที่พิมพ์บนเอกสารขาย" — ใช้ตัดสินว่าต้องบันทึก PDF เวอร์ชันใหม่ลง Drive ไหม
//
// เดิมผูกกับ UpdatedAt → แนบสลิป/ออกใบเสร็จจากใบวางบิล/บันทึก PDF ฯลฯ ทำให้เกิด _v2, _v3
// ที่หน้าตาเหมือนเดิม · ตอนนี้: เทียบข้อมูลหัวเอกสาร (ตัดคอลัมน์ที่ไม่ได้พิมพ์) + รายการสินค้า
// (ตัด LineID ที่สร้างใหม่ทุกครั้งที่แก้) — เหมือนเดิม = ใช้ไฟล์เดิม · ต่าง = เวอร์ชันใหม่ (CTRL-09)
// ===========================================

import { createHash } from "crypto";

export type SalesDocKind = "quotation" | "billing" | "tax-invoice" | "receipt";

type Row = Record<string, string | undefined>;

/** คอลัมน์ที่ไม่ได้พิมพ์บนเอกสาร (เปลี่ยนแล้วไม่ต้องมีไฟล์ใหม่) */
const COMMON_SKIP = new Set([
  "UpdatedAt",
  "CreatedAt",
  "PdfUrl",
  "PdfFor",
  "PdfContentFor",
  "ReceiptPdfUrl",
  "ReceiptPdfFor",
  "ReceiptPdfContentFor",
  "PaymentEvidenceUrl",
  "WHTCertUrl",
  "PreparedByUserId",
  "IssuedAt",
  "VoidedAt",
  "PaymentRecordedAt",
  "FileUrl",
  "UploadedFileUrl",
]);

/** ใบวางบิล: เลข/วันที่ใบเสร็จ (ออกทีหลังที่แถวเดียวกัน) ไม่ได้พิมพ์บนใบวางบิล */
const BILLING_SKIP = new Set(["ReceiptNumber", "ReceiptDate", "VoidReason", "TaxDocMode"]);

/** คอลัมน์ของรายการสินค้าที่ไม่ได้พิมพ์ */
const LINE_SKIP = new Set(["LineID", "BillingID", "QuotationID", "TaxInvoiceID"]);

function stable(row: Row, skip: Set<string>, extraSkip?: Set<string>): [string, string][] {
  return Object.keys(row)
    .filter((k) => !skip.has(k) && !extraSkip?.has(k))
    .map((k) => [k, String(row[k] ?? "").trim()] as [string, string])
    // คอลัมน์ว่าง (รวมคอลัมน์ใหม่ที่ ensureTabs เพิ่มทีหลัง) ไม่นับ — เพิ่มคอลัมน์ไม่ทำให้เกิดเวอร์ชันใหม่
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
}

export function salesDocFingerprint(kind: SalesDocKind, header: Row, lines: Row[]): string {
  const head = stable(header, COMMON_SKIP, kind === "billing" ? BILLING_SKIP : undefined);
  const body = [...lines]
    .sort((a, b) => (parseInt(a.LineNumber || "0", 10) || 0) - (parseInt(b.LineNumber || "0", 10) || 0))
    .map((l) => stable(l, LINE_SKIP));
  return createHash("sha1").update(JSON.stringify([kind, head, body])).digest("hex").slice(0, 20);
}
