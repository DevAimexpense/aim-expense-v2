// ===========================================
// /reports/wht — Client component
//
// "รายงานหัก ณ ที่จ่าย" (ภ.ง.ด.3 + ภ.ง.ด.53)
//
// Layout
// ------
//   header   — title + ExportButton (top-right)
//   filters  — DateRangePicker + Project SearchableSelect
//   stats    — 4 StatCards (รายการ / ยอดเงินได้ / ภาษีหัก / ผู้รับเงิน)
//   tabs     — ภงด.3 (บุคคลธรรมดา) | ภงด.53 (นิติบุคคล)
//   table    — DataTable for the active bucket
//
// Data
// ----
//   trpc.report.wht({from, to, eventId?})  → returns both pnd3 + pnd53 buckets
//   trpc.event.list                        → for project filter
//
// Notes
// -----
//   - status === "paid" only (Revenue Dept files = actual cash-out, not approvals)
//   - WTHAmount > 0 only — no point listing rows with no withholding
//   - vendor split by TaxID prefix:
//       * 13 digits starting with "0" → นิติบุคคล (pnd53)
//       * else (incl. empty)          → บุคคลธรรมดา (pnd3)
//   - PDF export per Revenue Dept form 100% is deferred to S20 (needs Org
//     fields wired from Sheets `Config` tab — TaxID/Address/Branch).
// ===========================================

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

type WhtTab = "pnd3" | "pnd53";

const TABS: { key: WhtTab; label: string; icon: string; sub: string }[] = [
  { key: "pnd3", label: "ภงด.3", icon: "👤", sub: "บุคคลธรรมดา" },
  { key: "pnd53", label: "ภงด.53", icon: "🏢", sub: "นิติบุคคล" },
];

type WhtRow = {
  paymentId: string;
  paidDate: string;
  payeeId: string;
  payeeName: string;
  taxId: string;
  branchLabel: string;
  address: string;
  eventId: string;
  eventName: string;
  incomeType: string;
  rate: number;
  incomeAmount: number;
  whtAmount: number;
  condition: number;
  invoiceNumber: string;
  description: string;
};

export function WhtClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ----- Tab state (sync to URL ?tab=pnd3|pnd53) -----
  const tabFromUrl = searchParams.get("tab") as WhtTab | null;
  const initialTab: WhtTab =
    tabFromUrl && TABS.some((t) => t.key === tabFromUrl) ? tabFromUrl : "pnd3";
  const [tab, setTab] = useState<WhtTab>(initialTab);

  function handleTabChange(next: WhtTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/reports/wht?${params.toString()}`, { scroll: false });
  }

  // ----- Filters -----
  // Default: this month + all projects (matches Revenue Dept monthly filing cadence)
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
    router.replace(`/reports/wht?${params.toString()}`, { scroll: false });
  }

  // LOCAL timezone (avoid off-by-one)
  const fromIso = toLocalDateString(range.from);
  const toIso = toLocalDateString(range.to);

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const reportQuery = trpc.report.wht.useQuery({
    from: fromIso,
    to: toIso,
    eventId: eventId === "all" ? undefined : eventId,
  });

  const overallStats = reportQuery.data?.stats ?? {
    totalCount: 0,
    totalIncome: 0,
    totalWHT: 0,
    payeeCount: 0,
  };
  const pnd3 = reportQuery.data?.pnd3 ?? {
    stats: { totalCount: 0, totalIncome: 0, totalWHT: 0, payeeCount: 0 },
    rows: [] as WhtRow[],
  };
  const pnd53 = reportQuery.data?.pnd53 ?? {
    stats: { totalCount: 0, totalIncome: 0, totalWHT: 0, payeeCount: 0 },
    rows: [] as WhtRow[],
  };

  // Active bucket
  const activeRows: WhtRow[] = tab === "pnd3" ? pnd3.rows : pnd53.rows;
  const activeStats = tab === "pnd3" ? pnd3.stats : pnd53.stats;

  // ===== DataTable columns — mirror Revenue Dept ใบแนบ ภงด.3/53 layout =====
  const columns = useMemo<ColumnDef<WhtRow, unknown>[]>(
    () => [
      {
        accessorKey: "paidDate",
        header: "วันที่จ่าย",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "taxId",
        header: "เลขผู้เสียภาษี",
        cell: ({ getValue, row }) => {
          const id = getValue<string>();
          const branch = row.original.branchLabel;
          return (
            <span className="num" style={{ fontSize: "0.8125rem" }}>
              {id || "—"}
              {branch && (
                <span style={{ color: "#94a3b8", marginLeft: 6 }}>
                  ({branch})
                </span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "payeeName",
        header: "ผู้มีเงินได้",
        cell: ({ getValue, row }) => {
          const name = getValue<string>();
          const addr = row.original.address;
          return (
            <div>
              <div style={{ fontWeight: 500 }}>{name}</div>
              {addr && (
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  {addr}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "incomeType",
        header: "ประเภทเงินได้",
        cell: ({ getValue, row }) => {
          const type = getValue<string>();
          const desc = row.original.description;
          return (
            <div>
              <div>{type}</div>
              {desc && desc !== type && (
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  {desc}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "rate",
        header: "อัตรา %",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{ display: "block", textAlign: "right" }}
          >
            {getValue<number>().toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "incomeAmount",
        header: "จำนวนเงินที่จ่าย",
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
        accessorKey: "whtAmount",
        header: "ภาษีหัก",
        cell: ({ getValue }) => (
          <span
            className="num"
            style={{
              display: "block",
              textAlign: "right",
              fontWeight: 600,
              color: "#0f766e",
            }}
          >
            ฿{formatTHB(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "condition",
        header: "เงื่อนไข",
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="num" style={{ display: "block", textAlign: "center" }}>
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "eventName",
        header: "โปรเจกต์",
        cell: ({ getValue }) => (
          <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
            {getValue<string>()}
          </span>
        ),
      },
    ],
    [],
  );

  // ===== Export columns — mirrors ใบแนบ ภงด.3/53 spec =====
  // (PDF export per gov form 100% is deferred to S20; CSV/XLSX uses these columns.)
  const exportColumns = useMemo<ExportColumn<WhtRow>[]>(
    () => [
      {
        key: "paidDate",
        header: "วันที่จ่าย",
        format: (v) => formatThaiDate(v as string),
      },
      { key: "taxId", header: "เลขประจำตัวผู้เสียภาษี" },
      { key: "branchLabel", header: "สาขาที่" },
      { key: "payeeName", header: "ชื่อผู้มีเงินได้" },
      { key: "address", header: "ที่อยู่" },
      { key: "incomeType", header: "ประเภทเงินได้" },
      {
        key: "rate",
        header: "อัตราภาษี (%)",
        format: (v) => Number(v).toFixed(2),
      },
      {
        key: "incomeAmount",
        header: "จำนวนเงินที่จ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "whtAmount",
        header: "ภาษีหัก ณ ที่จ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "condition",
        header: "เงื่อนไข",
        format: (v) => String(v),
      },
      { key: "eventName", header: "โปรเจกต์" },
      { key: "invoiceNumber", header: "เลขที่ใบแจ้งหนี้" },
    ],
    [],
  );

  const tabLabel = TABS.find((t) => t.key === tab);

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📊 รายงานหัก ณ ที่จ่าย</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
            {" • "}
            <span style={{ color: "#94a3b8" }}>
              เฉพาะรายการที่จ่ายแล้ว (paid)
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

      {/* Stat cards (overall — sum of both buckets) */}
      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="📋"
          label="รายการรวม"
          value={overallStats.totalCount.toLocaleString("th-TH")}
          sub={`ภงด.3: ${pnd3.stats.totalCount.toLocaleString(
            "th-TH",
          )} • ภงด.53: ${pnd53.stats.totalCount.toLocaleString("th-TH")}`}
        />
        <StatCard
          color="violet"
          icon="💵"
          label="ยอดเงินได้รวม"
          value={`฿${formatTHB(overallStats.totalIncome)}`}
          sub="ก่อนหักภาษี ณ ที่จ่าย"
        />
        <StatCard
          color="green"
          icon="🧾"
          label="ภาษีหัก ณ ที่จ่ายรวม"
          value={`฿${formatTHB(overallStats.totalWHT)}`}
          sub="นำส่งสรรพากร"
        />
        <StatCard
          color="amber"
          icon="👥"
          label="ผู้รับเงิน (unique)"
          value={overallStats.payeeCount.toLocaleString("th-TH")}
          sub="นับซ้ำกันไม่ได้"
        />
      </div>

      {/* Tabs */}
      <div className="app-tabs" role="tablist">
        {TABS.map((t) => {
          const count =
            t.key === "pnd3" ? pnd3.stats.totalCount : pnd53.stats.totalCount;
          const wht =
            t.key === "pnd3" ? pnd3.stats.totalWHT : pnd53.stats.totalWHT;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`app-tab ${tab === t.key ? "app-tab-active" : ""}`}
              onClick={() => handleTabChange(t.key)}
            >
              <span>{t.icon}</span>
              <span>
                {t.label}{" "}
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  ({t.sub})
                </span>
              </span>
              <span
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "0.75rem",
                  color: tab === t.key ? "inherit" : "#94a3b8",
                }}
              >
                {count.toLocaleString("th-TH")} รายการ • ฿{formatTHB(wht)}
              </span>
            </button>
          );
        })}
      </div>

      {/* PDF export note (S20 deliverable) */}
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: "0.5rem",
          fontSize: "0.8125rem",
          color: "#92400e",
          marginBottom: "0.75rem",
        }}
      >
        ℹ️ <strong>หมายเหตุ:</strong> Export PDF ตามฟอร์มกรมสรรพากร 100%
        (ใบแนบ + ใบสรุป {tabLabel?.label}) จะเปิดใช้งานใน Session
        ถัดไป (ต้องการ TaxID + ที่อยู่บริษัทจาก Google Sheet ก่อน). ตอนนี้
        รองรับ <strong>CSV / XLSX</strong> ที่ครบ column ตามฟอร์มแล้ว.
      </div>

      {/* Active table + export */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "#475569", margin: 0 }}>
          แสดง <strong>{activeRows.length.toLocaleString("th-TH")}</strong>{" "}
          รายการ • ภาษีหักรวม{" "}
          <strong style={{ color: "#0f766e" }}>
            ฿{formatTHB(activeStats.totalWHT)}
          </strong>
        </p>
        <ExportButton
          data={activeRows}
          columns={exportColumns}
          filename={`wht-${tab}_${fromIso}_${toIso}`}
          pdfTitle={`รายงาน${tabLabel?.label} ${formatThaiDate(
            fromIso,
          )} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
      </div>
      <DataTable<WhtRow>
        columns={columns}
        data={activeRows}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหาเลขผู้เสียภาษี / ชื่อ / โปรเจกต์..."
        loading={reportQuery.isLoading}
        emptyMessage={
          tab === "pnd3"
            ? "ไม่มีรายการหัก ณ ที่จ่ายของบุคคลธรรมดาในช่วงเวลานี้"
            : "ไม่มีรายการหัก ณ ที่จ่ายของนิติบุคคลในช่วงเวลานี้"
        }
      />
    </div>
  );
}
