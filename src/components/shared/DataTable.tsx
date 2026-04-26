/**
 * DataTable — generic data table with pagination, sort, and search.
 * Built on @tanstack/react-table v8 (headless).
 *
 * @example
 *   const columns: ColumnDef<Payment>[] = [
 *     { accessorKey: "date", header: "วันที่" },
 *     { accessorKey: "amount", header: "จำนวน",
 *       cell: ({ getValue }) => `฿${getValue<number>().toLocaleString()}` },
 *   ];
 *   <DataTable columns={columns} data={payments} searchable />
 */

"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { DataTablePagination } from "./DataTablePagination";

export type { ColumnDef } from "@tanstack/react-table";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /** Default page size (default 10) */
  pageSize?: number;
  /** Available page sizes for the selector */
  pageSizeOptions?: number[];
  /** Enable column sorting (default true) */
  sortable?: boolean;
  /** Show global-search input above the table */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Hide the pagination row entirely (useful for small static tables) */
  hidePagination?: boolean;
  /** Custom empty-state — defaults to "ไม่มีรายการ" */
  emptyMessage?: ReactNode;
  /** Loading flag — shows skeleton state */
  loading?: boolean;
  /** Hook for row click — receives original data row */
  onRowClick?: (row: TData) => void;
  /** Custom container className */
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 10,
  pageSizeOptions,
  sortable = true,
  searchable = false,
  searchPlaceholder = "ค้นหา…",
  hidePagination = false,
  emptyMessage = "ไม่มีรายการ",
  loading = false,
  onRowClick,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const tableInstance = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: searchable ? getFilteredRowModel() : undefined,
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: hidePagination ? undefined : getPaginationRowModel(),
    enableSorting: sortable,
    enableGlobalFilter: searchable,
    initialState: {
      pagination: { pageSize, pageIndex: 0 },
    },
  });

  const visibleRows = tableInstance.getRowModel().rows;
  const colCount = useMemo(
    () => tableInstance.getAllLeafColumns().length,
    [tableInstance]
  );

  return (
    <div className={["app-datatable", className].filter(Boolean).join(" ")}>
      {searchable && (
        <div className="app-datatable-toolbar">
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="app-input app-input-sm"
            aria-label="ค้นหาในตาราง"
          />
        </div>
      )}

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            {tableInstance.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      style={{
                        cursor: canSort ? "pointer" : "default",
                        userSelect: canSort ? "none" : "auto",
                      }}
                      aria-sort={
                        sortDir === "asc"
                          ? "ascending"
                          : sortDir === "desc"
                          ? "descending"
                          : "none"
                      }
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {canSort && (
                          <span
                            aria-hidden="true"
                            style={{
                              color: sortDir ? "#2563eb" : "#cbd5e1",
                              fontSize: "0.7rem",
                            }}
                          >
                            {sortDir === "desc"
                              ? "▼"
                              : sortDir === "asc"
                              ? "▲"
                              : "↕"}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}
                >
                  กำลังโหลด…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={onRowClick ? "app-datatable-row-clickable" : undefined}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!hidePagination && data.length > 0 && (
        <DataTablePagination
          table={tableInstance}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  );
}

export default DataTable;
