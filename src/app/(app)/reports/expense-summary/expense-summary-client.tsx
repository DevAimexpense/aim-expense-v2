// ===========================================
// /reports/expense-summary — Client component
//
// Layout
// ------
//   header   — title + ExportButton (top-right)
//   filters  — DateRangePicker + Project/Status/Type SearchableSelects
//   stats    — 4 StatCards (total / count / average / max)
//   table    — DataTable with row count, sort, search, pagination
//
// Data
// ----
//   trpc.report.expenseSummary({from,to,eventId?,status?,expenseType?})
//   trpc.event.list — for project filter dropdown
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

// Row shape returned by report.expenseSummary
type Row = {
  paymentId: string;
  date: string;
  eventId: string;
  eventName: string;
  payeeId: string;
  payeeName: string;
  description: string;
  expenseType: "team" | "account";
  amount: number;
  status: "pending" | "approved" | "paid" | "rejected" | "cleared";
  categoryMain: string;
  categorySub: string;
};

// ---------- Display helpers ----------

const STATUS_LABEL: Record<Row["status"], { label: string; class: string }> = {
  pending: { label: "รอตรวจ", class: "app-badge-warning" },
  approved: { label: "อนุมัติแล้ว", class: "app-badge-info" },
  paid: { label: "จ่ายแล้ว", class: "app-badge-success" },
  rejected: { label: "ปฏิเสธ", class: "app-badge-error" },
  cleared: { label: "เคลียร์แล้ว", class: "app-badge-success" },
};

const TYPE_LABEL: Record<
  Row["expenseType"],
  { label: string; class: string; icon: string }
> = {
  team: { label: "เบิกเงินสด", class: "app-badge-warning", icon: "💵" },
  account: { label: "โอนบัญชี", class: "app-badge-info", icon: "🏦" },
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

// ---------- Component ----------

export function ExpenseSummaryClient({ orgName }: { orgName: string }) {
  // Filters (default = this month)
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [eventId, setEventId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [expenseType, setExpenseType] = useState<string>("all");

  // Convert Date → ISO YYYY-MM-DD for the query
  const fromIso = range.from.toISOString().slice(0, 10);
  const toIso = range.to.toISOString().slice(0, 10);

  // Data
  const eventsQuery = trpc.event.list.useQuery();
  const reportQuery = trpc.report.expenseSummary.useQuery({
    from: fromIso,
    to: toIso,
    eventId: eventId === "all" ? undefined : eventId,
    status: status === "all" ? undefined : (status as Row["status"]),
    expenseType:
      expenseType === "all" ? undefined : (expenseType as Row["expenseType"]),
  });

  const events = eventsQuery.data || [];
  const stats = reportQuery.data?.stats ?? {
    total: 0,
    count: 0,
    average: 0,
    max: 0,
  };
  const rows: Row[] = reportQuery.data?.rows ?? [];

  // ---------- Table columns ----------
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: "วันที่",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "eventName",
        header: "โปรเจกต์",
      },
      {
        accessorKey: "payeeName",
        header: "ผู้รับเงิน",
      },
      {
        accessorKey: "description",
        header: "รายละเอียด",
        cell: ({ getValue, row }) => (
          <div>
            <div style={{ fontWeight: 500 }}>{getValue<string>()}</div>
            {(row.original.categoryMain || row.original.categorySub) && (
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#94a3b8",
                  marginTop: "0.125rem",
                }}
              >
                {row.original.categoryMain}
                {row.original.categorySub
                  ? ` › ${row.original.categorySub}`
                  : ""}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "expenseType",
        header: "ประเภท",
        cell: ({ getValue }) => {
          const t = TYPE_LABEL[getValue<Row["expenseType"]>()];
          return (
            <span className={`app-badge ${t.class}`}>
              {t.icon} {t.label}
            </span>
          );
        },
      },
      {
        accessorKey: "amount",
        header: "ยอดชำระ",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{ fontWeight: 600, display: "block", textAlign: "right" }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "สถานะ",
        cell: ({ getValue }) => {
          const s = STATUS_LABEL[getValue<Row["status"]>()];
          return <span className={`app-badge ${s.class}`}>{s.label}</span>;
        },
      },
    ],
    []
  );

  // ---------- Export columns (string-only output) ----------
  const exportColumns = useMemo<ExportColumn<Row>[]>(
    () => [
      { key: "date", header: "วันที่", format: (v) => formatThaiDate(v as string) },
      { key: "eventName", header: "โปรเจกต์" },
      { key: "payeeName", header: "ผู้รับเงิน" },
      { key: "description", header: "รายละเอียด" },
      { key: "categoryMain", header: "หมวดหมู่หลัก" },
      { key: "categorySub", header: "หมวดหมู่ย่อย" },
      {
        key: "expenseType",
        header: "ประเภท",
        format: (v) => TYPE_LABEL[v as Row["expenseType"]]?.label || String(v),
      },
      {
        key: "status",
        header: "สถานะ",
        format: (v) => STATUS_LABEL[v as Row["status"]]?.label || String(v),
      },
      {
        key: "amount",
        header: "ยอดชำระ (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
    ],
    []
  );

  const filenameDate = `${fromIso}_${toIso}`;

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📊 รายงานสรุปค่าใช้จ่าย</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <ExportButton
            data={rows}
            columns={exportColumns}
            filename={`expense-summary_${filenameDate}`}
            pdfTitle={`รายงานสรุปค่าใช้จ่าย ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
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
            { value: "all", label: "ทุกโปรเจกต์" },
            ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
          ]}
          value={eventId}
          onChange={(v) => setEventId(v)}
          className="app-select"
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
        {(eventId !== "all" ||
          status !== "all" ||
          expenseType !== "all") && (
          <button
            onClick={() => {
              setEventId("all");
              setStatus("all");
              setExpenseType("all");
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
          icon="💰"
          label="ยอดรวม"
          value={`฿${formatTHB(stats.total)}`}
          sub={`${stats.count.toLocaleString("th-TH")} รายการ`}
        />
        <StatCard
          color="violet"
          icon="📊"
          label="เฉลี่ยต่อรายการ"
          value={`฿${formatTHB(stats.average)}`}
          sub="ยอดเฉลี่ย"
        />
        <StatCard
          color="amber"
          icon="🔝"
          label="รายการสูงสุด"
          value={`฿${formatTHB(stats.max)}`}
          sub="รายการที่ยอดมากสุด"
        />
        <StatCard
          color="green"
          icon="🧾"
          label="จำนวนรายการ"
          value={stats.count.toLocaleString("th-TH")}
          sub={
            stats.count > 0
              ? `เฉลี่ย ฿${formatTHB(stats.average)}/รายการ`
              : "ไม่มีรายการในช่วงเวลานี้"
          }
        />
      </div>

      {/* Table */}
      <DataTable<Row>
        columns={columns}
        data={rows}
        pageSize={25}
        searchable
        loading={reportQuery.isLoading}
        emptyMessage="ไม่มีรายการในช่วงเวลาและตัวกรองที่เลือก"
      />
    </div>
  );
}
