// ===========================================
// Bank CSV Exporter — Generic format
//
// Generates a CSV file suitable for upload to bank Bulk Payment portals.
// This is a GENERIC format — column headers and field order can be tuned
// per-bank when actual specs are confirmed (KBank, SCB, etc.).
//
// Generic columns:
//   1. Bank Name        — e.g. "ธนาคารกสิกรไทย"
//   2. Account Number   — e.g. "1234567890"
//   3. Account Name     — recipient name (PayeeName)
//   4. Amount           — number, 2 decimals, no thousand separator
//   5. Reference        — PaymentID (acts as our internal correlation key)
//   6. Description      — optional memo, capped to 50 chars (most banks limit)
//   7. Tax ID           — recipient TaxID (some banks require for >50k THB)
//
// Encoding:
//   - UTF-8 with BOM (so Excel + KBank/SCB upload portals open Thai correctly)
//
// CSV escaping:
//   - RFC 4180: wrap field in "..." if it contains , " or newline
//   - Escape inner " as ""
// ===========================================

export type BankCsvRow = {
  /** ชื่อธนาคารผู้รับ (Thai name from Banks master list) */
  bankName: string;
  /** เลขบัญชีผู้รับ */
  accountNumber: string;
  /** ชื่อบัญชี / ชื่อผู้รับเงิน */
  accountName: string;
  /** จำนวนเงิน (THB) */
  amount: number;
  /** Reference / PaymentID */
  reference: string;
  /** Memo / Description (optional) */
  description?: string;
  /** Tax ID ของผู้รับ (optional) */
  taxId?: string;
};

const CSV_HEADERS = [
  "Bank Name",
  "Account Number",
  "Account Name",
  "Amount",
  "Reference",
  "Description",
  "Tax ID",
] as const;

const MAX_DESCRIPTION_LEN = 50;

/** Escape one CSV field per RFC 4180. */
function escapeField(v: string | number): string {
  const s = typeof v === "number" ? String(v) : v;
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format an amount as "1234.56" — no thousand separator, always 2 decimals. */
function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/** Trim + cap description to bank-friendly length (50 chars). */
function shortDesc(s: string | undefined): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > MAX_DESCRIPTION_LEN ? t.slice(0, MAX_DESCRIPTION_LEN) : t;
}

/**
 * Build a CSV string (UTF-8 with BOM) from an array of bank rows.
 *
 * @example
 *   const csv = buildBankCsv([
 *     { bankName: "ธนาคารกสิกรไทย", accountNumber: "1234567890",
 *       accountName: "บริษัท ABC จำกัด", amount: 12500, reference: "PMT_001" }
 *   ]);
 *   // Then: download as text/csv with `csv` as the body.
 */
export function buildBankCsv(rows: BankCsvRow[]): string {
  const lines: string[] = [];

  // Header
  lines.push(CSV_HEADERS.map(escapeField).join(","));

  // Body
  for (const r of rows) {
    lines.push(
      [
        escapeField(r.bankName),
        escapeField(r.accountNumber),
        escapeField(r.accountName),
        escapeField(formatAmount(r.amount)),
        escapeField(r.reference),
        escapeField(shortDesc(r.description)),
        escapeField(r.taxId || ""),
      ].join(","),
    );
  }

  // UTF-8 BOM so Excel + bank portals render Thai correctly
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * Trigger a CSV file download in the browser.
 *
 * @param rows     — Bank CSV rows
 * @param filename — Suggested filename (without extension); we'll append ".csv"
 */
export function downloadBankCsv(rows: BankCsvRow[], filename: string): void {
  const csv = buildBankCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click handler completes before GC
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a sensible filename for a weekly bank batch.
 * Format: bank-batch-YYYY-MM-DD_to_YYYY-MM-DD.csv
 */
export function bankCsvFilename(from: string, to: string): string {
  return `bank-batch-${from}_to_${to}`;
}
