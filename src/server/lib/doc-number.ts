// ===========================================
// Aim Expense — Document Number Helpers
// Customizable per-org prefix + sequential numbering per year
// (S22 Q7 — design doc 13.1)
// ===========================================

import { GoogleSheetsService } from "../services/google-sheets.service";

// RC = ใบเสร็จรับเงิน (ออกจากใบวางบิลที่รับเงินครบ — เลขเก็บในคอลัมน์ ReceiptNumber ของ Billings)
export type DocPrefixType = "QT" | "BIL" | "TI" | "RC";

const CONFIG_KEYS: Record<DocPrefixType, string> = {
  QT: "DOC_PREFIX_QT",
  BIL: "DOC_PREFIX_BIL",
  TI: "DOC_PREFIX_TI",
  RC: "DOC_PREFIX_RC",
};

/**
 * อ่าน prefix ของ document type จาก Config tab
 * Fallback = type literal ถ้าไม่ตั้งค่า
 */
export async function getDocPrefix(
  sheets: GoogleSheetsService,
  type: DocPrefixType
): Promise<string> {
  const config = await sheets.getConfigMap();
  const raw = (config[CONFIG_KEYS[type]] || type).trim();
  return raw || type;
}

/**
 * อ่าน prefix ทั้ง 3 ประเภทใน 1 API call (สำหรับ /settings/org)
 */
export async function getAllDocPrefixes(
  sheets: GoogleSheetsService
): Promise<Record<DocPrefixType, string>> {
  const config = await sheets.getConfigMap();
  return {
    QT: (config[CONFIG_KEYS.QT] || "QT").trim() || "QT",
    BIL: (config[CONFIG_KEYS.BIL] || "BIL").trim() || "BIL",
    TI: (config[CONFIG_KEYS.TI] || "TI").trim() || "TI",
    RC: (config[CONFIG_KEYS.RC] || "RC").trim() || "RC",
  };
}

/** ปี-เดือน (ค.ศ.) ของวันที่เอกสาร — ใช้เป็นงวดของเลขรัน */
export function docPeriod(docDate: string | Date | undefined | null): {
  yyyy: string;
  mm: string;
} {
  const d = docDate ? new Date(docDate) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return {
    yyyy: String(safe.getFullYear()),
    mm: String(safe.getMonth() + 1).padStart(2, "0"),
  };
}

/**
 * คำนวณเลขเอกสารถัดไป — `{PREFIX}-{YYYY}-{MM}-{3-digit-seq}` (เลขรันเริ่มใหม่ทุกเดือน)
 *
 * ตัวอย่าง: `QT-2026-08-001`, `BIL-2026-08-042`
 * (รูปแบบเดิม `QT-2026-0001` ที่ออกไปแล้วคงเดิม — ไม่ถูกนับรวมในเลขรันของเดือน)
 *
 * @param docDate      วันที่เอกสาร (ISO) — กำหนดปี/เดือนของเลขรัน
 * @param tab          ชื่อ sheet ที่อ่าน (SHEET_TABS.QUOTATIONS / BILLINGS / TAX_INVOICES)
 * @param statusFilter optional — filter row ตาม Status field (เช่น TI: นับเฉพาะ "issued")
 * @param numberColumn คอลัมน์ที่เก็บเลข (default DocNumber) — ใบเสร็จรับเงินใช้ ReceiptNumber
 */
export async function computeNextDocNumber(
  sheets: GoogleSheetsService,
  type: DocPrefixType,
  docDate: string,
  tab: string,
  statusFilter?: (status: string) => boolean,
  numberColumn: string = "DocNumber"
): Promise<string> {
  const prefix = await getDocPrefix(sheets, type);
  const all = await sheets.getAll(tab);
  const { yyyy, mm } = docPeriod(docDate);
  const periodPrefix = `${prefix}-${yyyy}-${mm}-`;
  const seqs = all
    .filter((r) => {
      if (statusFilter && !statusFilter(r.Status || "")) return false;
      return (r[numberColumn] || "").startsWith(periodPrefix);
    })
    .map((r) => parseInt((r[numberColumn] || "").slice(periodPrefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
  return `${prefix}-${yyyy}-${mm}-${String(next).padStart(3, "0")}`;
}

/**
 * Validate prefix string — ตามข้อตกลง design doc 13.1
 * - ห้ามว่าง
 * - ห้าม space
 * - max 8 chars
 * - allow [A-Z0-9/-]
 */
export function isValidDocPrefix(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (value.length > 8) return false;
  return /^[A-Z0-9/-]+$/.test(value);
}
