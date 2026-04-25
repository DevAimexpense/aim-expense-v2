/**
 * Shared business components — building blocks for dashboards & reports.
 *
 * Convention:
 *   - One component per file, named export + default export.
 *   - Re-export here for ergonomic imports:
 *       import { StatCard } from "@/components/shared";
 */

export { StatCard } from "./StatCard";
export type {
  StatCardProps,
  StatCardColor,
  StatCardTrend,
} from "./StatCard";

export { DataTable } from "./DataTable";
export type { DataTableProps, ColumnDef } from "./DataTable";

export { DataTablePagination } from "./DataTablePagination";
export type { DataTablePaginationProps } from "./DataTablePagination";

export { DateRangePicker, getPresetRange } from "./DateRangePicker";
export type {
  DateRangePickerProps,
  DateRange,
  DateRangePreset,
} from "./DateRangePicker";

export { ExportButton } from "./ExportButton";
export type { ExportButtonProps, ExportFormat, ExportColumn } from "./ExportButton";

export {
  exportToCSV,
  exportToXLSX,
  exportToPDF,
} from "./export-utils";
export type { PDFExportOptions } from "./export-utils";
