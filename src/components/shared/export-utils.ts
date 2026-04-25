/**
 * export-utils — generators for CSV / XLSX / PDF downloads.
 * Used by <ExportButton>; can also be called directly.
 *
 * Browser-only (use inside "use client" components).
 */

export interface ExportColumn<TRow> {
  /** Object key used to read the value */
  key: keyof TRow & string;
  /** Header label shown in exports */
  header: string;
  /** Optional formatter — receives raw value, returns string or number */
  format?: (value: TRow[keyof TRow], row: TRow) => string | number;
}

function getCellValue<TRow>(
  row: TRow,
  col: ExportColumn<TRow>
): string | number {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw.toLocaleDateString("th-TH");
  return raw as any;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Escape a CSV cell — RFC 4180 */
function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCSV<TRow>(
  data: TRow[],
  columns: ExportColumn<TRow>[],
  filename: string
): void {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => csvEscape(getCellValue(row, c))).join(",")
  );
  // Prepend BOM so Excel opens UTF-8 (Thai) correctly
  const csv = "﻿" + [header, ...rows].join("\r\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export async function exportToXLSX<TRow>(
  data: TRow[],
  columns: ExportColumn<TRow>[],
  filename: string,
  sheetName = "Sheet1"
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...data.map((row) => columns.map((c) => getCellValue(row, c))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto column widths (rough: use max char length)
  ws["!cols"] = columns.map((c, idx) => {
    const max = Math.max(
      c.header.length,
      ...data.map((row) => String(getCellValue(row, c)).length)
    );
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export interface PDFExportOptions {
  title?: string;
  /** Page orientation — defaults to portrait */
  orientation?: "portrait" | "landscape";
}

/**
 * Render data as an off-screen HTML table → html2canvas → jsPDF.
 * Pros: native Thai font support (browser does the rendering).
 * Cons: rasterized (not selectable text). Good for receipts/reports.
 */
export async function exportToPDF<TRow>(
  data: TRow[],
  columns: ExportColumn<TRow>[],
  filename: string,
  options: PDFExportOptions = {}
): Promise<void> {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasMod.default;

  // Build offscreen table
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;width:794px;background:white;" +
    "font-family:'IBM Plex Sans Thai',sans-serif;padding:24px;color:#0f172a;";
  const titleHtml = options.title
    ? `<h2 style="margin:0 0 16px 0;font-size:18px;font-weight:700;">${escapeHtml(
        options.title
      )}</h2>`
    : "";
  const headerCells = columns
    .map(
      (c) =>
        `<th style="background:#f8fafc;text-align:left;padding:8px 10px;border-bottom:1px solid #cbd5e1;font-weight:600;font-size:12px;color:#475569;">${escapeHtml(
          c.header
        )}</th>`
    )
    .join("");
  const bodyRows = data
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (c) =>
              `<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;">${escapeHtml(
                String(getCellValue(row, c))
              )}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  container.innerHTML =
    titleHtml +
    `<table style="width:100%;border-collapse:collapse;"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>` +
    `<p style="margin-top:16px;font-size:10px;color:#94a3b8;">สร้างโดย Aim Expense • ${new Date().toLocaleString(
      "th-TH"
    )}</p>`;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: "#ffffff",
    });
    const orientation = options.orientation ?? "portrait";
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * pageW) / canvas.width;

    // Multi-page slicing if content is taller than one page
    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
    } else {
      let remaining = imgH;
      let yOffset = 0;
      while (remaining > 0) {
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          0,
          -yOffset,
          imgW,
          imgH
        );
        remaining -= pageH;
        yOffset += pageH;
        if (remaining > 0) pdf.addPage();
      }
    }
    pdf.save(`${filename}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
