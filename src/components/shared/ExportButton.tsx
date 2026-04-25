/**
 * ExportButton — dropdown to export data as PDF / Excel / CSV.
 *
 * @example
 *   const columns: ExportColumn<Payment>[] = [
 *     { key: "date", header: "วันที่" },
 *     { key: "vendor", header: "ผู้ขาย" },
 *     { key: "amount", header: "จำนวน",
 *       format: (v) => `฿${Number(v).toLocaleString("th-TH")}` },
 *   ];
 *   <ExportButton data={payments} columns={columns}
 *                 filename="payments-2026-04" pdfTitle="รายงานการชำระเงิน เม.ย. 69" />
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  exportToCSV,
  exportToPDF,
  exportToXLSX,
  type ExportColumn,
  type PDFExportOptions,
} from "./export-utils";

export type { ExportColumn } from "./export-utils";

export type ExportFormat = "pdf" | "xlsx" | "csv";

export interface ExportButtonProps<TRow> {
  data: TRow[];
  columns: ExportColumn<TRow>[];
  /** Base filename — extension added automatically */
  filename: string;
  /** Which formats to show in the menu (default: all 3) */
  formats?: ExportFormat[];
  /** PDF title rendered at the top of the document */
  pdfTitle?: string;
  pdfOrientation?: PDFExportOptions["orientation"];
  /** Excel sheet name */
  sheetName?: string;
  /** Hide button when data is empty (default: disable instead) */
  hideWhenEmpty?: boolean;
  /** Custom button label (default: "ส่งออก") */
  label?: string;
  /** Disable the entire button */
  disabled?: boolean;
  className?: string;
  /** Notify parent when an export starts/finishes (for analytics or toasts) */
  onExportStart?: (format: ExportFormat) => void;
  onExportEnd?: (format: ExportFormat, error?: Error) => void;
}

const FORMAT_META: Record<ExportFormat, { icon: string; label: string }> = {
  pdf: { icon: "📄", label: "PDF" },
  xlsx: { icon: "📊", label: "Excel (.xlsx)" },
  csv: { icon: "📑", label: "CSV" },
};

const DEFAULT_FORMATS: ExportFormat[] = ["pdf", "xlsx", "csv"];

export function ExportButton<TRow>({
  data,
  columns,
  filename,
  formats = DEFAULT_FORMATS,
  pdfTitle,
  pdfOrientation,
  sheetName,
  hideWhenEmpty = false,
  label = "ส่งออก",
  disabled = false,
  className,
  onExportStart,
  onExportEnd,
}: ExportButtonProps<TRow>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isEmpty = data.length === 0;
  if (hideWhenEmpty && isEmpty) return null;

  const isDisabled = disabled || isEmpty || busy !== null;

  const handleExport = async (format: ExportFormat) => {
    setBusy(format);
    setOpen(false);
    onExportStart?.(format);
    try {
      if (format === "csv") {
        exportToCSV(data, columns, filename);
      } else if (format === "xlsx") {
        await exportToXLSX(data, columns, filename, sheetName);
      } else if (format === "pdf") {
        await exportToPDF(data, columns, filename, {
          title: pdfTitle,
          orientation: pdfOrientation,
        });
      }
      onExportEnd?.(format);
    } catch (err) {
      console.error(`[ExportButton] ${format} failed:`, err);
      onExportEnd?.(format, err as Error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={["app-export", className].filter(Boolean).join(" ")}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className="app-btn app-btn-secondary"
        onClick={() => !isDisabled && setOpen((v) => !v)}
        disabled={isDisabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={isEmpty ? "ไม่มีข้อมูลให้ส่งออก" : undefined}
      >
        <span aria-hidden="true">{busy ? "⏳" : "⬇️"}</span>
        <span style={{ marginLeft: "0.4rem" }}>
          {busy ? `กำลังสร้าง ${FORMAT_META[busy].label}…` : label}
        </span>
        <span aria-hidden="true" style={{ marginLeft: "0.4rem", fontSize: "0.7rem" }}>
          ▾
        </span>
      </button>

      {open && (
        <div className="app-export-menu" role="menu">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              className="app-export-menu-item"
              onClick={() => handleExport(f)}
            >
              <span aria-hidden="true">{FORMAT_META[f].icon}</span>
              <span>{FORMAT_META[f].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExportButton;
