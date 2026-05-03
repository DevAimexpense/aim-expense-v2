// ===========================================
// Aim Expense — Document Number Helpers
// Customizable per-org prefix + sequential numbering per year
// (S22 Q7 — design doc 13.1)
// ===========================================

import { GoogleSheetsService } from "../services/google-sheets.service";

export type DocPrefixType = "QT" | "BIL" | "TI";

const CONFIG_KEYS: Record<DocPrefixType, string> = {
  QT: "DOC_PREFIX_QT",
  BIL: "DOC_PREFIX_BIL",
  TI: "DOC_PREFIX_TI",
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
  };
}

/**
 * คำนวณเลขเอกสารถัดไป — `{PREFIX}-{YEAR}-{4-digit-seq}`
 *
 * ตัวอย่าง: `QT-2026-0001`, `BIL-2026-0042`, `B/2026/0099` ถ้า user ตั้ง prefix `B/`
 *
 * @param tab          ชื่อ sheet ที่อ่าน (SHEET_TABS.QUOTATIONS / BILLINGS / TAX_INVOICES)
 * @param statusFilter optional — filter row ตาม Status field (เช่น TI: นับเฉพาะ "issued")
 *
 * Reset index ทุกปี (filter ตาม year prefix แล้ว max+1)
 */
export async function computeNextDocNumber(
  sheets: GoogleSheetsService,
  type: DocPrefixType,
  year: number,
  tab: string,
  statusFilter?: (status: string) => boolean
): Promise<string> {
  const prefix = await getDocPrefix(sheets, type);
  const all = await sheets.getAll(tab);
  const yearPrefix = `${prefix}-${year}-`;
  const seqs = all
    .filter((r) => {
      if (statusFilter && !statusFilter(r.Status || "")) return false;
      return (r.DocNumber || "").startsWith(yearPrefix);
    })
    .map((r) => parseInt((r.DocNumber || "").slice(yearPrefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
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
