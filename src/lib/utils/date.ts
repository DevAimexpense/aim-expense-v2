// ===========================================
// Central date formatting — dd/mm/yyyy with Buddhist year (พ.ศ.)
// e.g. 31/12/2569. Use these EVERYWHERE a date is shown to a user
// (UI, PDF documents, LINE messages, exports) so the whole system is
// consistent. Do NOT use for numbers/currency (that's toLocaleString).
// ===========================================

function toDate(
  input: Date | string | number | null | undefined,
): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format as `dd/mm/yyyy` with Buddhist year (พ.ศ.). e.g. `31/12/2569`.
 * Returns `"-"` for null/invalid input.
 */
export function formatDate(
  input: Date | string | number | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Format as `dd/mm/yyyy HH:mm` with Buddhist year (พ.ศ.). e.g. `31/12/2569 14:30`.
 * Returns `"-"` for null/invalid input.
 */
export function formatDateTime(
  input: Date | string | number | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${min}`;
}

/**
 * Format as `mm/yyyy` with Buddhist year (พ.ศ.). e.g. `12/2569`.
 * For month/period labels.
 */
export function formatMonthYear(
  input: Date | string | number | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${mm}/${yyyy}`;
}

// ===========================================
// "วันนี้" ตามเวลาไทย — ใช้แทน `new Date().toISOString().slice(0, 10)` ทุกที่
// (ISO = UTC → ช่วง 00:00–07:00 เวลาไทยจะได้วันก่อนหน้า ทำให้เอกสารลงวัน/เลขเดือนผิด)
// ใช้ได้ทั้ง server และ client
// ===========================================
const BANGKOK_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** วันที่ตามเวลาไทยในรูป `YYYY-MM-DD` (ค.ศ.) — ค่าเริ่มต้นคือตอนนี้ */
export function todayBangkok(d: Date = new Date()): string {
  return BANGKOK_YMD.format(d); // en-CA ให้ YYYY-MM-DD
}

/** เดือนตามเวลาไทยในรูป `YYYY-MM` (ใช้กับโควตารายเดือน / เลขเอกสารรายเดือน) */
export function yearMonthBangkok(d: Date = new Date()): string {
  return todayBangkok(d).slice(0, 7);
}
