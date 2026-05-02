// ===========================================
// /reports/vat — Client component
//
// "รายงานภาษีซื้อ" — Purchase VAT report. Input-VAT side of ภ.พ.30.
// Output VAT (sales side) will arrive once the quotation/invoice module ships.
//
// Layout
// ------
//   header   — title + subtitle + scope reminder ("ภาษีซื้ออย่างเดียว")
//   filters  — DateRangePicker + Project + DateField switch (receipt vs payment)
//   stats    — 4 StatCards (count / total base / total VAT / vendor count)
//   table    — DataTable + Export (CSV/XLSX/PDF)
//
// Data
// ----
//   trpc.report.vat({from, to, eventId?, dateField})
//   trpc.event.list                                    — for project filter
//
// Filter rules (mirrors procedure)
// --------------------------------
//   - status === "paid"
//   - DocumentType === "tax_invoice"
//   - VATAmount > 0
//   - Date filter on ReceiptDate (default) or PaymentDate (toggle)
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

type DateField = "receiptDate" | "paymentDate";

type VatRow = {
  paymentId: string;
  date: string;
  receiptDate: string;
  paymentDate: string;
  invoiceNumber: string;
  receiptNumber: string;
  payeeId: string;
  payeeName: string;
  taxId: string;
  branchLabel: string;
  address: string;
  eventId: string;
  eventName: string;
  baseAmount: number;
  vatAmount: number;
  description: string;
  expenseNature: string;
};

const DATE_FIELD_LABEL: Record<DateField, string> = {
  receiptDate: "วันที่ใบกำกับภาษี",
  paymentDate: "วันที่จ่ายเงิน",
};

export function VatClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ----- Filters -----
  const eventIdFromUrl = searchParams.get("eventId");
  const dateFieldFromUrl = searchParams.get("dateField");
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [eventId, setEventId] = useState<string>(eventIdFromUrl || "all");
  const [dateField, setDateField] = useState<DateField>(
    dateFieldFromUrl === "paymentDate" ? "paymentDate" : "receiptDate",
  );

  function updateUrlParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(`/reports/vat${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function handleEventIdChange(next: string) {
    setEventId(next);
    updateUrlParam("eventId", next === "all" ? null : next);
  }

  function handleDateFieldChange(next: DateField) {
    setDateField(next);
    updateUrlParam("dateField", next === "receiptDate" ? null : next);
  }

  // LOCAL timezone (avoid off-by-one)
  const fromIso = toLocalDateString(range.from);
  const toIso = toLocalDateString(range.to);

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const reportQuery = trpc.report.vat.useQuery({
    from: fromIso,
    to: toIso,
    eventId: eventId === "all" ? undefined : eventId,
    dateField,
  });

  const stats = reportQuery.data?.stats ?? {
    totalCount: 0,
    totalBase: 0,
    totalVAT: 0,
    vendorCount: 0,
  };
  const rows: VatRow[] = reportQuery.data?.rows ?? [];

  // ===== DataTable columns =====
  const columns = useMemo<ColumnDef<VatRow, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: DATE_FIELD_LABEL[dateField],
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "invoiceNumber",
        header: "เลขที่ใบกำกับ",
        cell: ({ getValue, row }) => {
          const inv = getValue<string>();
          const rcpt = row.original.receiptNumber;
          return (
            <div>
              <div className="num" style={{ fontSize: "0.8125rem" }}>
                {inv || "—"}
              </div>
              {rcpt && rcpt !== inv && (
                <div
                  className="num"
                  style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                >
                  ใบเสร็จ: {rcpt}
                </div>
              )}
            </div>
          );
        },
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
        header: "ผู้ขาย/ผู้ให้บริการ",
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
        accessorKey: "description",
        header: "รายการ",
        cell: ({ getValue, row }) => {
          const desc = getValue<string>();
          const nature = row.original.expenseNature;
          const natureLabel =
            nature === "goods" ? "สินค้า" : nature === "service" ? "บริการ" : "";
          return (
            <div>
              <div style={{ fontSize: "0.8125rem" }}>{desc || "—"}</div>
              {natureLabel && (
                <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {natureLabel}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "baseAmount",
        header: "ฐานภาษี",
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
        accessorKey: "vatAmount",
        header: "ภาษีซื้อ",
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
        accessorKey: "eventName",
        header: "โปรเจกต์",
        cell: ({ getValue }) => (
          <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
            {getValue<string>()}
          </span>
        ),
      },
    ],
    [dateField],
  );

  // ===== Export columns =====
  const exportColumns = useMemo<ExportColumn<VatRow>[]>(
    () => [
      {
        key: "date",
        header: DATE_FIELD_LABEL[dateField],
        format: (v) => formatThaiDate(v as string),
      },
      { key: "invoiceNumber", header: "เลขที่ใบกำกับภาษี" },
      { key: "receiptNumber", header: "เลขที่ใบเสร็จ" },
      { key: "taxId", header: "เลขประจำตัวผู้เสียภาษี" },
      { key: "branchLabel", header: "สาขาที่" },
      { key: "payeeName", header: "ชื่อผู้ขาย/ผู้ให้บริการ" },
      { key: "address", header: "ที่อยู่" },
      { key: "description", header: "รายการ" },
      {
        key: "expenseNature",
        header: "ประเภท",
        format: (v) =>
          v === "goods" ? "สินค้า" : v === "service" ? "บริการ" : "",
      },
      {
        key: "baseAmount",
        header: "ฐานภาษี (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "vatAmount",
        header: "ภาษีซื้อ (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      { key: "eventName", header: "โปรเจกต์" },
    ],
    [dateField],
  );

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📈 รายงานภาษีซื้อ (ภ.พ.30)</h1>
          <p className="app-page-subtitle">
            {orgName} • Input VAT • {formatThaiDate(fromIso)} –{" "}
            {formatThaiDate(toIso)}
            {" • "}
            <span style={{ color: "#94a3b8" }}>
              เฉพาะใบกำกับภาษีที่จ่ายแล้ว (paid + tax_invoice)
            </span>
          </p>
        </div>
      </div>

      {/* Scope notice — explains why this is "ภาษีซื้อ only" */}
      <div
        style={{
          padding: "0.6rem 0.875rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "0.5rem",
          marginBottom: "0.75rem",
          fontSize: "0.8125rem",
          color: "#1e40af",
          lineHeight: 1.6,
        }}
      >
        ℹ️ <strong>รายงานนี้แสดงเฉพาะภาษีซื้อ (Input VAT)</strong> — ภ.พ.30
        ทั้งใบต้องรวมภาษีขาย (Output VAT) ด้วย ซึ่งจะมาเมื่อระบบใบเสนอราคา /
        ใบกำกับภาษีฝั่งขายเปิดใช้งาน
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

        {/* Date-field toggle (Revenue Dept canonical = receiptDate) */}
        <select
          value={dateField}
          onChange={(e) => handleDateFieldChange(e.target.value as DateField)}
          className="app-select"
          aria-label="คอลัมน์วันที่ที่ใช้กรอง"
          title="เลือกว่าจะกรองด้วยวันที่ใบกำกับภาษี (ตามสรรพากร) หรือวันที่จ่ายเงินจริง"
        >
          <option value="receiptDate">📅 ใช้วันที่ใบกำกับภาษี</option>
          <option value="paymentDate">💰 ใช้วันที่จ่ายเงิน</option>
        </select>

        {(eventId !== "all" || dateField !== "receiptDate") && (
          <button
            onClick={() => {
              handleEventIdChange("all");
              handleDateFieldChange("receiptDate");
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
          icon="📋"
          label="จำนวนใบกำกับภาษี"
          value={stats.totalCount.toLocaleString("th-TH")}
          sub="paid + tax_invoice"
        />
        <StatCard
          color="violet"
          icon="💵"
          label="ฐานภาษีรวม"
          value={`฿${formatTHB(stats.totalBase)}`}
          sub="ก่อน VAT"
        />
        <StatCard
          color="green"
          icon="🧾"
          label="ภาษีซื้อรวม"
          value={`฿${formatTHB(stats.totalVAT)}`}
          sub="นำไปเครดิตที่ ภ.พ.30"
        />
        <StatCard
          color="amber"
          icon="🏢"
          label="ผู้ขาย (unique)"
          value={stats.vendorCount.toLocaleString("th-TH")}
          sub="นับซ้ำกันไม่ได้"
        />
      </div>

      {/* Table + export */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "#475569", margin: 0 }}>
          แสดง <strong>{rows.length.toLocaleString("th-TH")}</strong> รายการ •
          ภาษีซื้อรวม{" "}
          <strong style={{ color: "#0f766e" }}>
            ฿{formatTHB(stats.totalVAT)}
          </strong>
        </p>
        <ExportButton
          data={rows}
          columns={exportColumns}
          filename={`vat-purchase_${fromIso}_${toIso}`}
          pdfTitle={`รายงานภาษีซื้อ ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
      </div>
      <DataTable<VatRow>
        columns={columns}
        data={rows}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหาเลขที่ใบกำกับ / ผู้ขาย / โปรเจกต์..."
        loading={reportQuery.isLoading}
        emptyMessage="ไม่มีใบกำกับภาษีที่จ่ายแล้วในช่วงเวลานี้"
      />
    </div>
  );
}
