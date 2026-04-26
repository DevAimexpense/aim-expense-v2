// ===========================================
// Reports tab: แยกโปรเจกต์ (By Project)
// ===========================================

"use client";

import { useMemo } from "react";
import {
  StatCard,
  DataTable,
  ExportButton,
  type ColumnDef,
  type ExportColumn,
} from "@/components/shared";
import {
  formatTHB,
  formatThaiDate,
  ProgressBar,
  PROJECT_STATUS_LABEL,
} from "./_components";

type ProjectRow = {
  eventId: string;
  eventName: string;
  status: string;
  startDate: string;
  endDate: string;
  budget: number;
  totalSpent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
  paymentCount: number;
};

export type ByProjectTabData = {
  stats: {
    projectCount: number;
    totalBudget: number;
    totalSpent: number;
    overBudgetCount: number;
  };
  projects: ProjectRow[];
};

interface Props {
  fromIso: string;
  toIso: string;
  data: ByProjectTabData | undefined;
  isLoading: boolean;
  /** When true, parent re-fetches with includeEmpty so empty projects appear. */
  includeEmpty: boolean;
  onIncludeEmptyChange: (next: boolean) => void;
  /**
   * Drill-down callback: called when user clicks a project row.
   * Parent should switch to the overview tab and auto-filter by this eventId.
   */
  onDrillDown?: (eventId: string) => void;
}

export function ByProjectTab({
  fromIso,
  toIso,
  data,
  isLoading,
  includeEmpty,
  onIncludeEmptyChange,
  onDrillDown,
}: Props) {
  const stats = data?.stats ?? {
    projectCount: 0,
    totalBudget: 0,
    totalSpent: 0,
    overBudgetCount: 0,
  };
  const projects: ProjectRow[] = data?.projects ?? [];

  const overallPercentage =
    stats.totalBudget > 0
      ? (stats.totalSpent / stats.totalBudget) * 100
      : 0;

  const columns = useMemo<ColumnDef<ProjectRow, unknown>[]>(
    () => [
      {
        accessorKey: "eventName",
        header: "โปรเจกต์",
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 500 }}>{row.original.eventName}</div>
            {(row.original.startDate || row.original.endDate) && (
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#94a3b8",
                  marginTop: "0.125rem",
                }}
              >
                {formatThaiDate(row.original.startDate)} –{" "}
                {formatThaiDate(row.original.endDate)}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "สถานะ",
        cell: ({ getValue }) => {
          const s = PROJECT_STATUS_LABEL[getValue<string>()] || {
            label: getValue<string>(),
            class: "app-badge-neutral",
          };
          return <span className={`app-badge ${s.class}`}>{s.label}</span>;
        },
      },
      {
        accessorKey: "budget",
        header: "งบประมาณ",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{ display: "block", textAlign: "right" }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "totalSpent",
        header: "ใช้ไปแล้ว",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{
              display: "block",
              textAlign: "right",
              fontWeight: 600,
            }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "remaining",
        header: "คงเหลือ",
        cell: ({ getValue, row }) => (
          <span
            className="num"
            style={{
              display: "block",
              textAlign: "right",
              color: row.original.isOverBudget ? "#dc2626" : "#16a34a",
              fontWeight: row.original.isOverBudget ? 600 : 400,
            }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "percentage",
        header: "การใช้งบ",
        cell: ({ row }) => (
          <ProgressBar
            percentage={row.original.percentage}
            isOverBudget={row.original.isOverBudget}
          />
        ),
      },
      {
        accessorKey: "paymentCount",
        header: "รายการ",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{ display: "block", textAlign: "right" }}
          >
            {getValue<number>().toLocaleString("th-TH")}
          </span>
        ),
      },
    ],
    []
  );

  const exportColumns = useMemo<ExportColumn<ProjectRow>[]>(
    () => [
      { key: "eventName", header: "โปรเจกต์" },
      {
        key: "status",
        header: "สถานะ",
        format: (v) => PROJECT_STATUS_LABEL[v as string]?.label || String(v),
      },
      {
        key: "startDate",
        header: "วันเริ่ม",
        format: (v) => formatThaiDate(v as string),
      },
      {
        key: "endDate",
        header: "วันสิ้นสุด",
        format: (v) => formatThaiDate(v as string),
      },
      {
        key: "budget",
        header: "งบประมาณ (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "totalSpent",
        header: "ใช้ไปแล้ว (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "remaining",
        header: "คงเหลือ (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "percentage",
        header: "การใช้งบ (%)",
        format: (v) => `${Number(v).toFixed(1)}%`,
      },
      { key: "paymentCount", header: "จำนวนรายการ" },
    ],
    []
  );

  return (
    <>
      {/* Local controls (toggle + export) */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.875rem",
            color: "#475569",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeEmpty}
            onChange={(e) => onIncludeEmptyChange(e.target.checked)}
          />
          แสดงโปรเจกต์ที่ไม่มีรายการในช่วงนี้
        </label>
        <ExportButton
          data={projects}
          columns={exportColumns}
          filename={`by-project_${fromIso}_${toIso}`}
          pdfTitle={`รายงานแยกโปรเจกต์ ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
      </div>

      {/* Stat cards */}
      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="📁"
          label="โปรเจกต์ในช่วงนี้"
          value={stats.projectCount.toLocaleString("th-TH")}
          sub={
            includeEmpty
              ? "(รวมที่ไม่มีรายการ)"
              : "(เฉพาะที่มีรายการ)"
          }
        />
        <StatCard
          color="amber"
          icon="💰"
          label="งบประมาณรวม"
          value={`฿${formatTHB(stats.totalBudget)}`}
          sub={
            stats.projectCount > 0
              ? `เฉลี่ย ฿${formatTHB(stats.totalBudget / stats.projectCount)}/โปรเจกต์`
              : "—"
          }
        />
        <StatCard
          color="rose"
          icon="📤"
          label="ใช้ไปแล้ว"
          value={`฿${formatTHB(stats.totalSpent)}`}
          sub={
            stats.totalBudget > 0
              ? `${overallPercentage.toFixed(1)}% ของงบ`
              : "—"
          }
        />
        <StatCard
          color={stats.overBudgetCount > 0 ? "rose" : "green"}
          icon={stats.overBudgetCount > 0 ? "⚠️" : "✅"}
          label="โปรเจกต์ที่เกินงบ"
          value={stats.overBudgetCount.toLocaleString("th-TH")}
          sub={
            stats.overBudgetCount > 0
              ? "ต้องตรวจสอบ"
              : "อยู่ในงบทั้งหมด"
          }
        />
      </div>

      {onDrillDown && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#64748b",
            margin: "0 0.25rem 0.5rem",
          }}
        >
          💡 กดที่แถวโปรเจกต์เพื่อดูรายการค่าใช้จ่ายทั้งหมดของโปรเจกต์นั้น
        </div>
      )}

      <DataTable<ProjectRow>
        columns={columns}
        data={projects}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหาชื่อโปรเจกต์..."
        loading={isLoading}
        onRowClick={
          onDrillDown ? (row) => onDrillDown(row.eventId) : undefined
        }
        emptyMessage={
          includeEmpty
            ? "ยังไม่มีโปรเจกต์ในระบบ"
            : "ไม่มีโปรเจกต์ที่มีรายการในช่วงเวลานี้ — ลองติ๊กแสดงทั้งหมด"
        }
      />
    </>
  );
}
