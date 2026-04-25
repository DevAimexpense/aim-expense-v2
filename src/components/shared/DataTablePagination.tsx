/**
 * DataTablePagination — page size selector + prev/next + page info.
 * Used internally by <DataTable>; can also be reused on custom tables.
 */

import type { Table } from "@tanstack/react-table";

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  /** Hide the page-size selector */
  hidePageSize?: boolean;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  hidePageSize = false,
}: DataTablePaginationProps<TData>) {
  const state = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const startIdx = total === 0 ? 0 : state.pageIndex * state.pageSize + 1;
  const endIdx = Math.min((state.pageIndex + 1) * state.pageSize, total);

  return (
    <div className="app-table-pagination">
      <div className="app-table-pagination-info">
        {total === 0 ? (
          <span>ไม่มีรายการ</span>
        ) : (
          <span>
            แสดง <strong>{startIdx.toLocaleString("th-TH")}</strong>–
            <strong>{endIdx.toLocaleString("th-TH")}</strong> จาก{" "}
            <strong>{total.toLocaleString("th-TH")}</strong> รายการ
          </span>
        )}
      </div>

      <div className="app-table-pagination-controls">
        {!hidePageSize && (
          <label className="app-table-pagination-pagesize">
            <span>ต่อหน้า</span>
            <select
              className="app-select app-select-sm"
              value={state.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="app-table-pagination-buttons">
          <button
            type="button"
            className="app-btn app-btn-ghost app-btn-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="หน้าแรก"
          >
            «
          </button>
          <button
            type="button"
            className="app-btn app-btn-ghost app-btn-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="หน้าก่อน"
          >
            ‹
          </button>
          <span className="app-table-pagination-page">
            หน้า {state.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
          </span>
          <button
            type="button"
            className="app-btn app-btn-ghost app-btn-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="หน้าถัดไป"
          >
            ›
          </button>
          <button
            type="button"
            className="app-btn app-btn-ghost app-btn-sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="หน้าสุดท้าย"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataTablePagination;
