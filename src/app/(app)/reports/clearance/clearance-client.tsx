// ===========================================
// /reports/clearance — Client component
//
// "เคลียร์งบ" report — track Team Expense reconciliation status.
//
// Layout
// ------
//   header   — title + ExportButton (top-right)
//   filters  — DateRangePicker + Project SearchableSelect
//   stats    — 4 StatCards (pending / overdue / cleared / avg-days)
//   tabs     — รอเคลียร์ | เคลียร์แล้ว
//   table    — DataTable for the active bucket
//
// Data
// ----
//   trpc.report.clearance({from, to, eventId?, bucket?})
//   trpc.event.list — for project filter
//
// Notes
// -----
//   - "เคลียร์งบ" applies only to Team Expenses (cash advances).
//   - Filter date = PaidAt (not CreatedAt) — i.e. "what we paid out in this range".
//   - Overdue threshold = 14 days (server-side constant).
// ===========================================

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import {
  formatTHB,
  formatThaiDate,
  toLocalDateString,
} from "../_components";

type Bucket = "pending" | "cleared";

const TABS: { key: Bucket; label: string; icon: string }[] = [
  { key: "pending", label: "รอเคลียร์", icon: "⏳" },
  { key: "cleared", label: "เคลียร์แล้ว", icon: "✅" },
];

type PendingRow = {
  paymentId: string;
  paidDate: string;
  eventId: string;
  eventName: string;
  payeeId: string;
  payeeName: string;
  description: string;
  amount: number;
  daysSincePaid: number;
  isOverdue: boolean;
  notes: string;
};

type ClearedRow = {
  paymentId: string;
  paidDate: string;
  clearedAt: string;
  eventId: string;
  eventName: string;
  payeeId: string;
  payeeName: string;
  description: string;
  amount: number;
  daysToClear: number;
  receiptUrl: string;
};

export function ClearanceClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ----- Tab state (sync to URL) -----
  const tabFromUrl = searchParams.get("tab") as Bucket | null;
  const initialTab: Bucket =
    tabFromUrl && TABS.some((t) => t.key === tabFromUrl) ? tabFromUrl : "pending";
  const [tab, setTab] = useState<Bucket>(initialTab);

  function handleTabChange(next: Bucket) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/reports/clearance?${params.toString()}`, { scroll: false });
  }

  // ----- Filters -----
  // Default: this month + all projects
  const eventIdFromUrl = searchParams.get("eventId");
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [eventId, setEventId] = useState<string>(eventIdFromUrl || "all");

  function handleEventIdChange(next: string) {
    setEventId(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("eventId");
    } else {
      params.set("eventId", next);
    }
    router.replace(`/reports/clearance?${params.toString()}`, { scroll: false });
  }

  // LOCAL timezone (avoid off-by-one bug)
  const fromIso = toLocalDateString(range.from);
  const toIso = toLocalDateString(range.to);

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const reportQuery = trpc.report.clearance.useQuery({
    from: fromIso,
    to: toIso,
    eventId: eventId === "all" ? undefined : eventId,
  });

  const stats = reportQuery.data?.stats ?? {
    pendingCount: 0,
    pendingAmount: 0,
    clearedCount: 0,
    clearedAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    averageDaysToClear: 0,
    overdueThresholdDays: 14,
  };
  const pending: PendingRow[] = reportQuery.data?.pending ?? [];
  const cleared: ClearedRow[] = reportQuery.data?.cleared ?? [];

  // ===== Pending columns =====
  const pendingColumns = useMemo<ColumnDef<PendingRow, unknown>[]>(
    () => [
      {
        accessorKey: "paidDate",
        header: "วันที่จ่าย",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      { accessorKey: "eventName", header: "โปรเจกต์" },
      { accessorKey: "payeeName", header: "ผู้รับเงิน" },
      {
        accessorKey: "description",
        header: "รายละเอียด",
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500 }}>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: "ยอดจ่าย",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{
              fontWeight: 600,
              display: "block",
              textAlign: "right",
            }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "daysSincePaid",
        header: "รอเคลียร์",
        cell: ({ getValue, row }) => {
          const d = getValue<number>();
          const overdue = row.original.isOverdue;
          return (
            <span
              className={`app-badge ${
                overdue ? "app-badge-error" : "app-badge-warning"
              }`}
            >
              {overdue ? "⚠ " : ""}
              {d} วัน
            </span>
          );
        },
      },
      {
        accessorKey: "paymentId",
        header: "การกระทำ",
        enableSorting: false,
        cell: ({ getValue }) => {
          const id = getValue<string>();
          return (
            <Link
              href={`/documents?tab=need_clear&paymentId=${id}`}
              className="app-btn app-btn-sm app-btn-primary"
              style={{ whiteSpace: "nowrap" }}
              onClick={(e) => e.stopPropagation()}
            >
              เคลียร์งบ →
            </Link>
          );
        },
      },
    ],
    []
  );

  // ===== Cleared columns =====
  const clearedColumns = useMemo<ColumnDef<ClearedRow, unknown>[]>(
    () => [
      {
        accessorKey: "paidDate",
        header: "วันที่จ่าย",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "clearedAt",
        header: "วันที่เคลียร์",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "daysToClear",
        header: "ใช้เวลา",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{ display: "block", textAlign: "right" }}
          >
            {getValue<number>()} วัน
          </span>
        ),
      },
      { accessorKey: "eventName", header: "โปรเจกต์" },
      { accessorKey: "payeeName", header: "ผู้รับเงิน" },
      {
        accessorKey: "description",
        header: "รายละเอียด",
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500 }}>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: "ยอดจ่าย",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{
              fontWeight: 600,
              display: "block",
              textAlign: "right",
            }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "receiptUrl",
        header: "ใบเสร็จ",
        enableSorting: false,
        cell: ({ getValue }) => {
          const url = getValue<string>();
          if (!url) return <span style={{ color: "#94a3b8" }}>—</span>;
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#2563eb",
                fontSize: "0.8125rem",
                textDecoration: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              ดูใบเสร็จ ↗
            </a>
          );
        },
      },
    ],
    []
  );

  // ===== Export columns =====
  const pendingExport = useMemo<ExportColumn<PendingRow>[]>(
    () => [
      {
        key: "paidDate",
        header: "วันที่จ่าย",
        format: (v) => formatThaiDate(v as string),
      },
      { key: "eventName", header: "โปรเจกต์" },
      { key: "payeeName", header: "ผู้รับเงิน" },
      { key: "description", header: "รายละเอียด" },
      {
        key: "amount",
        header: "ยอดจ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      { key: "daysSincePaid", header: "รอเคลียร์ (วัน)" },
      { key: "notes", header: "หมายเหตุ" },
    ],
    []
  );

  const clearedExport = useMemo<ExportColumn<ClearedRow>[]>(
    () => [
      {
        key: "paidDate",
        header: "วันที่จ่าย",
        format: (v) => formatThaiDate(v as string),
      },
      {
        key: "clearedAt",
        header: "วันที่เคลียร์",
        format: (v) => formatThaiDate(v as string),
      },
      { key: "daysToClear", header: "ใช้เวลา (วัน)" },
      { key: "eventName", header: "โปรเจกต์" },
      { key: "payeeName", header: "ผู้รับเงิน" },
      { key: "description", header: "รายละเอียด" },
      {
        key: "amount",
        header: "ยอดจ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      { key: "receiptUrl", header: "ใบเสร็จ URL" },
    ],
    []
  );

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📑 เคลียร์งบ</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
            {" • "}
            <span style={{ color: "#94a3b8" }}>
              เฉพาะ Team Expense (เบิกเงินสด)
            </span>
          </p>
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
            { value: "all", label: "ทุกโปรเจกต์" },
            ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
          ]}
          value={eventId}
          onChange={handleEventIdChange}
          className="app-select"
        />
        {eventId !== "all" && (
          <button
            onClick={() => handleEventIdChange("all")}
            className="app-btn app-btn-ghost app-btn-sm"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="app-stats-grid">
        <StatCard
          color="amber"
          icon="⏳"
          label="รอเคลียร์"
          value={`฿${formatTHB(stats.pendingAmount)}`}
          sub={`${stats.pendingCount.toLocaleString("th-TH")} รายการ`}
        />
        <StatCard
          color={stats.overdueCount > 0 ? "rose" : "green"}
          icon={stats.overdueCount > 0 ? "⚠️" : "✅"}
          label={`เกินกำหนด (>${stats.overdueThresholdDays} วัน)`}
          value={stats.overdueCount.toLocaleString("th-TH")}
          sub={
            stats.overdueCount > 0
              ? `฿${formatTHB(stats.overdueAmount)} ต้องตรวจสอบ`
              : "ไม่มีรายการเกินกำหนด"
          }
        />
        <StatCard
          color="green"
          icon="✅"
          label="เคลียร์แล้ว"
          value={`฿${formatTHB(stats.clearedAmount)}`}
          sub={`${stats.clearedCount.toLocaleString("th-TH")} รายการ`}
        />
        <StatCard
          color="blue"
          icon="⏱️"
          label="เวลาเคลียร์เฉลี่ย"
          value={
            stats.clearedCount > 0
              ? `${stats.averageDaysToClear.toFixed(1)} วัน`
              : "—"
          }
          sub={
            stats.clearedCount > 0
              ? "ตั้งแต่จ่ายถึงเคลียร์"
              : "ไม่มีข้อมูล"
          }
        />
      </div>

      {/* Tabs */}
      <div className="app-tabs" role="tablist">
        {TABS.map((t) => {
          const count =
            t.key === "pending" ? stats.pendingCount : stats.clearedCount;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`app-tab ${tab === t.key ? "app-tab-active" : ""}`}
              onClick={() => handleTabChange(t.key)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span
                style={{
                  marginLeft: "0.375rem",
                  fontSize: "0.75rem",
                  color: tab === t.key ? "inherit" : "#94a3b8",
                }}
              >
                ({count.toLocaleString("th-TH")})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active table + export */}
      {tab === "pending" ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "0.75rem",
            }}
          >
            <ExportButton
              data={pending}
              columns={pendingExport}
              filename={`clearance-pending_${fromIso}_${toIso}`}
              pdfTitle={`รายงานรอเคลียร์งบ ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
              pdfOrientation="landscape"
              hideWhenEmpty
            />
          </div>
          <DataTable<PendingRow>
            columns={pendingColumns}
            data={pending}
            pageSize={25}
            searchable
            searchPlaceholder="ค้นหา..."
            loading={reportQuery.isLoading}
            emptyMessage="🎉 ไม่มีรายการรอเคลียร์ในช่วงเวลานี้"
          />
        </>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "0.75rem",
            }}
          >
            <ExportButton
              data={cleared}
              columns={clearedExport}
              filename={`clearance-cleared_${fromIso}_${toIso}`}
              pdfTitle={`รายงานเคลียร์งบแล้ว ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
              pdfOrientation="landscape"
              hideWhenEmpty
            />
          </div>
          <DataTable<ClearedRow>
            columns={clearedColumns}
            data={cleared}
            pageSize={25}
            searchable
            searchPlaceholder="ค้นหา..."
            loading={reportQuery.isLoading}
            emptyMessage="ยังไม่มีรายการที่เคลียร์ในช่วงเวลานี้"
          />
        </>
      )}
    </div>
  );
}
