// ===========================================
// /reports/weekly-payment — Client component
//
// "ชำระรายสัปดาห์" report — group approved payments by ISO week (Mon-Sun)
// for bank-batch planning. Two viewing modes: "ตาม DueDate" (plan-ahead)
// vs "ตาม PaymentDate" (audit).
//
// Layout
// ------
//   header   — title + mode toggle + Bank CSV download
//   filters  — DateRangePicker + Project SearchableSelect
//   stats    — 4 StatCards (rows / amount / weeks / payees)
//   weeks    — list of week sections, each with subtotal + DataTable
//
// Data
// ----
//   trpc.report.weeklyPayment({from, to, mode, eventId?})
//   trpc.event.list — for project filter
//
// Notes
// -----
//   - Status = approved only (paid is shown only in "paid" mode for audit)
//   - Bank CSV uses generic format — switch to bank-specific spec later
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
import {
  downloadBankCsv,
  bankCsvFilename,
  type BankCsvRow,
} from "@/lib/utils/bank-csv";

type Mode = "due" | "paid";

const MODE_TABS: { key: Mode; label: string; sub: string }[] = [
  { key: "due", label: "ตามกำหนดจ่าย", sub: "DueDate" },
  { key: "paid", label: "ตามวันที่จ่ายจริง", sub: "PaymentDate" },
];

type Row = {
  paymentId: string;
  date: string;
  weekStart: string;
  eventId: string;
  eventName: string;
  payeeId: string;
  payeeName: string;
  bankName: string;
  bankAccount: string;
  taxId: string;
  description: string;
  invoiceNumber: string;
  amount: number;
  wthAmount: number;
  vatAmount: number;
  status: string;
};

type Week = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  count: number;
  amount: number;
  rows: Row[];
};

export function WeeklyPaymentClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ----- Mode (sync to URL) -----
  const modeFromUrl = searchParams.get("mode") as Mode | null;
  const initialMode: Mode =
    modeFromUrl && MODE_TABS.some((m) => m.key === modeFromUrl)
      ? modeFromUrl
      : "due";
  const [mode, setMode] = useState<Mode>(initialMode);

  function handleModeChange(next: Mode) {
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", next);
    router.replace(`/reports/weekly-payment?${params.toString()}`, {
      scroll: false,
    });
  }

  // ----- Filters -----
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
    router.replace(`/reports/weekly-payment?${params.toString()}`, {
      scroll: false,
    });
  }

  // LOCAL timezone (avoid off-by-one bug)
  const fromIso = toLocalDateString(range.from);
  const toIso = toLocalDateString(range.to);

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const reportQuery = trpc.report.weeklyPayment.useQuery({
    from: fromIso,
    to: toIso,
    mode,
    eventId: eventId === "all" ? undefined : eventId,
  });

  const stats = reportQuery.data?.stats ?? {
    totalCount: 0,
    totalAmount: 0,
    weekCount: 0,
    payeeCount: 0,
  };
  const weeks: Week[] = reportQuery.data?.weeks ?? [];
  const allRows: Row[] = reportQuery.data?.rows ?? [];

  // ===== DataTable columns =====
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: mode === "due" ? "กำหนดจ่าย" : "วันที่จ่าย",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      { accessorKey: "eventName", header: "โปรเจกต์" },
      { accessorKey: "payeeName", header: "ผู้รับเงิน" },
      {
        accessorKey: "bankName",
        header: "ธนาคาร",
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return v ? (
            <span style={{ fontSize: "0.8125rem" }}>{v}</span>
          ) : (
            <span style={{ color: "#94a3b8" }}>—</span>
          );
        },
      },
      {
        accessorKey: "bankAccount",
        header: "เลขบัญชี",
        cell: ({ getValue }) => {
          const v = getValue<string>();
          return v ? (
            <span className="num" style={{ fontSize: "0.8125rem" }}>
              {v}
            </span>
          ) : (
            <span style={{ color: "#94a3b8" }}>—</span>
          );
        },
      },
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
    ],
    [mode],
  );

  // ===== Export columns (for the all-rows export) =====
  const exportColumns = useMemo<ExportColumn<Row>[]>(
    () => [
      { key: "weekStart", header: "สัปดาห์เริ่ม" },
      {
        key: "date",
        header: mode === "due" ? "กำหนดจ่าย" : "วันที่จ่าย",
        format: (v) => formatThaiDate(v as string),
      },
      { key: "eventName", header: "โปรเจกต์" },
      { key: "payeeName", header: "ผู้รับเงิน" },
      { key: "taxId", header: "เลขผู้เสียภาษี" },
      { key: "bankName", header: "ธนาคาร" },
      { key: "bankAccount", header: "เลขบัญชี" },
      { key: "invoiceNumber", header: "Invoice" },
      { key: "description", header: "รายละเอียด" },
      {
        key: "amount",
        header: "ยอดจ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "wthAmount",
        header: "หัก ณ ที่จ่าย (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "vatAmount",
        header: "VAT (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
    ],
    [mode],
  );

  // ===== Bank CSV download =====
  function handleDownloadBankCsv() {
    if (allRows.length === 0) return;

    // Filter rows that have a bank account — others can't be uploaded to bank
    const eligible = allRows.filter(
      (r) => r.bankAccount.trim().length > 0 && r.bankName.trim().length > 0,
    );

    if (eligible.length === 0) {
      window.alert(
        "ไม่มีรายการที่มีข้อมูลธนาคารครบ — โปรดเช็คข้อมูลผู้รับเงินก่อน",
      );
      return;
    }

    if (eligible.length < allRows.length) {
      const skipped = allRows.length - eligible.length;
      const ok = window.confirm(
        `จะข้าม ${skipped} รายการที่ไม่มีข้อมูลธนาคาร — ดาวน์โหลด ${eligible.length} รายการต่อไหม?`,
      );
      if (!ok) return;
    }

    const csvRows: BankCsvRow[] = eligible.map((r) => ({
      bankName: r.bankName,
      accountNumber: r.bankAccount,
      accountName: r.payeeName,
      amount: r.amount,
      reference: r.paymentId,
      description: r.description,
      taxId: r.taxId,
    }));

    downloadBankCsv(csvRows, bankCsvFilename(fromIso, toIso));
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">💰 ชำระรายสัปดาห์</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
            {" • "}
            <span style={{ color: "#94a3b8" }}>
              เฉพาะรายการ approved (อนุมัติแล้ว รอจ่าย)
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

      {/* Mode toggle */}
      <div
        className="app-tabs"
        role="tablist"
        style={{ marginBottom: "1rem" }}
      >
        {MODE_TABS.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            className={`app-tab ${mode === m.key ? "app-tab-active" : ""}`}
            onClick={() => handleModeChange(m.key)}
          >
            <span>{m.label}</span>
            <span
              style={{
                marginLeft: "0.375rem",
                fontSize: "0.75rem",
                color: mode === m.key ? "inherit" : "#94a3b8",
              }}
            >
              ({m.sub})
            </span>
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="📋"
          label="รายการทั้งหมด"
          value={stats.totalCount.toLocaleString("th-TH")}
          sub={`${stats.payeeCount.toLocaleString("th-TH")} ผู้รับเงิน`}
        />
        <StatCard
          color="amber"
          icon="💰"
          label="ยอดรวม"
          value={`฿${formatTHB(stats.totalAmount)}`}
          sub="ทั้งช่วงเวลา"
        />
        <StatCard
          color="green"
          icon="📅"
          label="จำนวนสัปดาห์"
          value={stats.weekCount.toLocaleString("th-TH")}
          sub="กลุ่ม Mon-Sun"
        />
        <StatCard
          color="rose"
          icon="🏦"
          label="ผู้รับเงิน"
          value={stats.payeeCount.toLocaleString("th-TH")}
          sub="unique payees"
        />
      </div>

      {/* Action row: Export all + Bank CSV */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={handleDownloadBankCsv}
          disabled={allRows.length === 0}
          className="app-btn app-btn-sm app-btn-primary"
          title="ดาวน์โหลด CSV สำหรับอัพโหลดเข้าระบบธนาคาร (Bulk Payment)"
        >
          🏦 Bank CSV (Bulk Payment)
        </button>
        <ExportButton
          data={allRows}
          columns={exportColumns}
          filename={`weekly-payment-${mode}_${fromIso}_${toIso}`}
          pdfTitle={`รายงานชำระรายสัปดาห์ (${mode === "due" ? "ตามกำหนดจ่าย" : "ตามวันที่จ่ายจริง"}) ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
      </div>

      {/* Weeks list */}
      {reportQuery.isLoading ? (
        <div className="app-empty">กำลังโหลด…</div>
      ) : weeks.length === 0 ? (
        <div className="app-empty">
          🎉 ไม่มีรายการ approved ในช่วงเวลานี้
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {weeks.map((w) => (
            <WeekSection key={w.weekStart} week={w} columns={columns} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Week section — one block per ISO week (header + DataTable)
// =====================================================================

function WeekSection({
  week,
  columns,
}: {
  week: Week;
  columns: ColumnDef<Row, unknown>[];
}) {
  return (
    <section className="app-card" style={{ padding: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.75rem",
          paddingBottom: "0.5rem",
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              margin: 0,
              color: "#0f172a",
            }}
          >
            📅 สัปดาห์ {week.weekLabel}
          </h2>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "#64748b",
              margin: "0.25rem 0 0 0",
            }}
          >
            {week.count.toLocaleString("th-TH")} รายการ
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p
            style={{
              fontSize: "0.75rem",
              color: "#64748b",
              margin: 0,
            }}
          >
            ยอดรวมสัปดาห์นี้
          </p>
          <p
            className="num"
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              margin: 0,
              color: "#0f172a",
            }}
          >
            ฿{formatTHB(week.amount)}
          </p>
        </div>
      </div>
      <DataTable<Row>
        columns={columns}
        data={week.rows}
        pageSize={50}
        searchable={false}
        emptyMessage="ไม่มีรายการ"
      />
    </section>
  );
}
