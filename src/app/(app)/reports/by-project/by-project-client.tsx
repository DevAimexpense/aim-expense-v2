// ===========================================
// /reports/by-project — Client component
//
// Layout
// ------
//   header   — title + ExportButton
//   filters  — DateRangePicker + Status/Type SearchableSelects + includeEmpty toggle
//   stats    — 4 StatCards (project count / total budget / total spent / over-budget)
//   table    — DataTable (project / status / budget / spent / remaining / progress / paymentCount)
// ===========================================

"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect from "@/components/searchable-select";
import {
  StatCard,
  DataTable,
  DateRangePicker,
  ExportButton,
  getPresetRange,
  type DateRange,
  type ColumnDef,
  type ExportColumn,
} from "@/components/shared";

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

// ---------- Helpers ----------

const STATUS_LABEL: Record<string, { label: string; class: string }> = {
  active: { label: "Active", class: "app-badge-info" },
  completed: { label: "เสร็จแล้ว", class: "app-badge-success" },
  cancelled: { label: "ยกเลิก", class: "app-badge-neutral" },
  paused: { label: "พักไว้", class: "app-badge-warning" },
};

function formatTHB(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatThaiDate(s: string): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return s;
  }
}

/**
 * Inline progress bar — uses CSS that we ship in this component.
 * Not a shared component yet (only used here). If a 2nd report needs
 * it, extract to /components/shared/ProgressBar.tsx.
 */
function ProgressBar({
  percentage,
  isOverBudget,
}: {
  percentage: number;
  isOverBudget: boolean;
}) {
  const pct = Math.min(100, Math.max(0, percentage));
  const color = isOverBudget
    ? "#dc2626" // rose-600
    : percentage >= 80
    ? "#d97706" // amber-600
    : "#16a34a"; // green-600
  return (
    <div style={{ minWidth: 120 }}>
      <div
        style={{
          height: 8,
          background: "#f1f5f9",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 0.3s ease",
          }}
        />
        {isOverBudget && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: 2,
              background: "#7f1d1d",
            }}
          />
        )}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          color: isOverBudget ? "#dc2626" : "#64748b",
          marginTop: 2,
          fontWeight: isOverBudget ? 600 : 400,
        }}
      >
        {percentage.toFixed(1)}%{isOverBudget ? " ⚠ เกินงบ" : ""}
      </div>
    </div>
  );
}

// ---------- Component ----------

export function ByProjectClient({ orgName }: { orgName: string }) {
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [status, setStatus] = useState<string>("all");
  const [expenseType, setExpenseType] = useState<string>("all");
  const [includeEmpty, setIncludeEmpty] = useState<boolean>(false);

  const fromIso = range.from.toISOString().slice(0, 10);
  const toIso = range.to.toISOString().slice(0, 10);

  const reportQuery = trpc.report.byProject.useQuery({
    from: fromIso,
    to: toIso,
    status:
      status === "all"
        ? undefined
        : (status as
            | "pending"
            | "approved"
            | "paid"
            | "rejected"
            | "cleared"),
    expenseType:
      expenseType === "all"
        ? undefined
        : (expenseType as "team" | "account"),
    includeEmpty,
  });

  const stats = reportQuery.data?.stats ?? {
    projectCount: 0,
    totalBudget: 0,
    totalSpent: 0,
    overBudgetCount: 0,
  };
  const projects: ProjectRow[] = reportQuery.data?.projects ?? [];

  const overallPercentage =
    stats.totalBudget > 0
      ? (stats.totalSpent / stats.totalBudget) * 100
      : 0;

  // ---------- Table columns ----------
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
          const s = STATUS_LABEL[getValue<string>()] || {
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
        header: "จำนวนรายการ",
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

  // ---------- Export columns ----------
  const exportColumns = useMemo<ExportColumn<ProjectRow>[]>(
    () => [
      { key: "eventName", header: "โปรเจกต์" },
      {
        key: "status",
        header: "สถานะ",
        format: (v) => STATUS_LABEL[v as string]?.label || String(v),
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

  const filenameDate = `${fromIso}_${toIso}`;

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📁 รายงานแยกโปรเจกต์</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <ExportButton
            data={projects}
            columns={exportColumns}
            filename={`by-project_${filenameDate}`}
            pdfTitle={`รายงานแยกโปรเจกต์ ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
            pdfOrientation="landscape"
            hideWhenEmpty
          />
        </div>
      </div>

      {/* Filters */}
      <div className="app-filter-row">
        <DateRangePicker
          value={range}
          onChange={setRange}
          presets={["this-month", "last-month"]}
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกสถานะ" },
            { value: "pending", label: "รอตรวจ" },
            { value: "approved", label: "อนุมัติแล้ว" },
            { value: "paid", label: "จ่ายแล้ว" },
            { value: "cleared", label: "เคลียร์แล้ว" },
          ]}
          value={status}
          onChange={(v) => setStatus(v)}
          className="app-select"
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกประเภท" },
            { value: "team", label: "เบิกเงินสด" },
            { value: "account", label: "โอนบัญชี" },
          ]}
          value={expenseType}
          onChange={(v) => setExpenseType(v)}
          className="app-select"
        />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.875rem",
            color: "#475569",
            cursor: "pointer",
            padding: "0 0.5rem",
          }}
        >
          <input
            type="checkbox"
            checked={includeEmpty}
            onChange={(e) => setIncludeEmpty(e.target.checked)}
          />
          แสดงโปรเจกต์ที่ไม่มีรายการ
        </label>
        {(status !== "all" ||
          expenseType !== "all" ||
          includeEmpty) && (
          <button
            onClick={() => {
              setStatus("all");
              setExpenseType("all");
              setIncludeEmpty(false);
            }}
            className="app-btn app-btn-ghost app-btn-sm"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="📁"
          label="โปรเจกต์ทั้งหมด"
          value={stats.projectCount.toLocaleString("th-TH")}
          sub="ในช่วงเวลาที่เลือก"
        />
        <StatCard
          color="amber"
          icon="💰"
          label="งบประมาณรวม"
          value={`฿${formatTHB(stats.totalBudget)}`}
          sub={
            stats.projectCount > 0
              ? `เฉลี่ย ฿${formatTHB(stats.totalBudget / stats.projectCount)}/โปรเจกต์`
              : "ยังไม่มีงบ"
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

      {/* Table */}
      <DataTable<ProjectRow>
        columns={columns}
        data={projects}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหาชื่อโปรเจกต์..."
        loading={reportQuery.isLoading}
        emptyMessage={
          includeEmpty
            ? "ยังไม่มีโปรเจกต์ในระบบ"
            : "ไม่มีโปรเจกต์ที่มีรายการในช่วงเวลานี้ — ลองติ๊ก 'แสดงโปรเจกต์ที่ไม่มีรายการ'"
        }
      />
    </div>
  );
}
