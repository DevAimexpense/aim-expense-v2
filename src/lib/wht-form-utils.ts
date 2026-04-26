// ===========================================
// WHT Form Utilities — สำหรับฟอร์ม ภงด.3/53 (ใบแนบ + ใบสรุป)
// ตามแบบฟอร์มกรมสรรพากร (พิมพ์ มี.ค. 2560)
// ===========================================

/**
 * Parse period string YYYY-MM → year, month, monthIndex (0-11)
 * Falls back to current month if invalid.
 */
export function parsePeriod(period: string): {
  year: number;
  month: number; // 1-12
  yearTH: number; // พ.ศ.
  monthName: string; // "เมษายน"
  fromISO: string; // first day of month — YYYY-MM-01
  toISO: string; // last day of month — YYYY-MM-DD
} {
  const m = /^(\d{4})-(\d{2})$/.exec((period || "").trim());
  let year: number;
  let month: number;
  if (m) {
    year = parseInt(m[1], 10);
    month = parseInt(m[2], 10);
    if (month < 1 || month > 12) {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  // Last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, "0");
  const lastDayStr = String(lastDay).padStart(2, "0");
  return {
    year,
    month,
    yearTH: year + 543,
    monthName: THAI_MONTHS_FULL[month - 1],
    fromISO: `${year}-${monthStr}-01`,
    toISO: `${year}-${monthStr}-${lastDayStr}`,
  };
}

export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * Format ISO date (YYYY-MM-DD) → "DD/MM/YY" (BE 2-digit year — fits cell width)
 * ตามฟอร์มกรมสรรพากร (วัน เดือน ปี ที่จ่าย — ปีพ.ศ. 2 หลัก)
 */
export function formatThaiDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const yearTH = d.getFullYear() + 543;
  const yy = String(yearTH).slice(-2);
  return `${day}/${month}/${yy}`;
}

/**
 * Format ISO date → "DD เดือนเต็ม พ.ศ.YYYY" (full Thai date — ลงท้ายเอกสาร)
 */
export function formatThaiDateLong(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = THAI_MONTHS_FULL[d.getMonth()];
  const yearTH = d.getFullYear() + 543;
  return `${day} ${month} ${yearTH}`;
}

/**
 * Format number → "1,234.56" — pure JS (no Intl) for SSR/CSR consistency.
 * (Intl.NumberFormat may insert hidden Unicode chars differently between
 *  Node.js and browser → causes React hydration mismatch.)
 * Empty / 0 → empty string (so blank cells stay blank)
 */
export function formatMoney(n: number): string {
  if (!n || n === 0) return "";
  return formatMoneyAlways(n);
}

/**
 * Always show 2 decimals — pure JS, ASCII-safe ("0.00" / "1,234.56")
 */
export function formatMoneyAlways(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const fixed = abs.toFixed(2);
  const [int, dec] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withCommas}.${dec}`;
}

/**
 * Split 13-digit Thai TaxID into individual digit cells
 * Format: X-XXXX-XXXXX-XX-X (13 boxes)
 * Returns array of 13 strings (digit or "")
 */
export function splitTaxIdBoxes(taxId: string): string[] {
  const digits = (taxId || "").replace(/\D/g, "").slice(0, 13);
  const out: string[] = [];
  for (let i = 0; i < 13; i++) {
    out.push(digits[i] || "");
  }
  return out;
}

/**
 * Split 5-digit branch number into individual digit cells
 * HQ → "00000"
 * Returns array of 5 strings
 */
export function splitBranchBoxes(branchLabel: string): string[] {
  const digits = (branchLabel || "").replace(/\D/g, "").padStart(5, "0").slice(-5);
  return digits.split("");
}

/**
 * Chunk array into groups of N (default 6 — for ใบแนบ ภงด rows per sheet)
 */
export function chunkInto<T>(arr: T[], size: number = 6): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out.length === 0 ? [[]] : out;
}

/**
 * Best-effort split a single-line address into header form fields.
 * Currently we just dump everything into "เลขที่" (line 1) — Prisma stores address
 * as a single string. ภายหลังถ้า /settings/org แยก field ได้ ค่อยมา parse เพิ่ม.
 *
 * Returns object with all form fields; pages will fill what's available.
 */
export function parseAddressFields(address: string): {
  building: string; // อาคาร
  roomNo: string; // ห้องเลขที่
  floor: string; // ชั้นที่
  village: string; // หมู่บ้าน
  houseNo: string; // เลขที่
  moo: string; // หมู่ที่
  soi: string; // ตรอก/ซอย
  yaek: string; // แยก
  road: string; // ถนน
  subdistrict: string; // ตำบล/แขวง
  district: string; // อำเภอ/เขต
  province: string; // จังหวัด
  postalCode: string; // รหัสไปรษณีย์
  raw: string; // raw fallback
} {
  const raw = (address || "").trim();
  // Best-effort regex extraction
  const postalMatch = raw.match(/(\d{5})/);
  const postalCode = postalMatch ? postalMatch[1] : "";

  const provinceMatch = raw.match(/จังหวัด\s*([^\s,]+)|จ\.\s*([^\s,]+)/);
  const province = provinceMatch ? (provinceMatch[1] || provinceMatch[2] || "") : "";

  const districtMatch = raw.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/);
  const district = districtMatch ? districtMatch[1] : "";

  const subdistrictMatch = raw.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/);
  const subdistrict = subdistrictMatch ? subdistrictMatch[1] : "";

  const roadMatch = raw.match(/(?:ถนน|ถ\.)\s*([^\s,]+)/);
  const road = roadMatch ? roadMatch[1] : "";

  const soiMatch = raw.match(/(?:ซอย|ตรอก|ซ\.)\s*([^\s,]+)/);
  const soi = soiMatch ? soiMatch[1] : "";

  return {
    building: "",
    roomNo: "",
    floor: "",
    village: "",
    houseNo: "", // กรอกเอาง่ายๆ — leave blank, fall back to raw
    moo: "",
    soi,
    yaek: "",
    road,
    subdistrict,
    district,
    province,
    postalCode,
    raw,
  };
}

/**
 * Generate "พ.ศ. ___" string from period year
 */
export function formatBuddhistYear(year: number): string {
  return String(year + 543);
}

/**
 * Map Prisma branchType + branchNumber → 5-digit display label
 *   HQ           → "00000"
 *   Branch + nnn → 5-digit pad
 *   ""           → ""
 */
export function branchLabelOf(branchType: string, branchNumber: string): string {
  if (branchType === "HQ") return "00000";
  if (branchType === "Branch" && branchNumber) {
    return branchNumber.padStart(5, "0");
  }
  return "";
}

/**
 * Map vendor TaxID → ภ.ง.ด. form per Thai standard
 *   - 13 digits starting with "0" → นิติบุคคล (ภงด.53)
 *   - else                        → บุคคลธรรมดา (ภงด.3)
 */
export function vendorTypeOf(taxId: string): "pnd3" | "pnd53" {
  const digits = (taxId || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("0")) return "pnd53";
  return "pnd3";
}
