// ===========================================
// Reports tab: ภาพรวม (Overview / Expense Summary)
// ===========================================

"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
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
  StatusBadge,
  TypeBadge,
  STATUS_LABEL,
  TYPE_LABEL,
  type PaymentStatus,
  type ExpenseType,
} from "./_components";

type Row = {
  paymentId: string;
  date: string;
  eventId: string;
  eventName: string;
  payeeId: string;
  payeeName: string;
  description: string;
  expenseType: ExpenseType;
  amount: number;
  status: PaymentStatus;
  categoryMain: string;
  categorySub: string;
};

interface Props {
  fromIso: string;
  toIso: string;
  eventId?: string;
  status?: PaymentStatus;
  expenseType?: ExpenseType;
}

export function OverviewTab({
  fromIso,
  toIso,
  eventId,
  status,
  expenseType,
}: Props) {
  const reportQuery = trpc.report.expenseSummary.useQuery({
    from: fromIso,
    to: toIso,
    eventId,
    status,
    expenseType,
  });

  const stats = reportQuery.data?.stats ?? {
    total: 0,
    count: 0,
    average: 0,
    max: 0,
  };
  const rows: Row[] = reportQuery.data?.rows ?? [];

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: "วันที่",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
      { accessorKey: "eventName", header: "โปรเจกต์" },
      { accessorKey: "payeeName", header: "ผู้รับเงิน" },
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
        cell: ({ getValue }) => <TypeBadge type={getValue<ExpenseType>()} />,
      },
      {
        accessorKey: "amount",
        header: "ยอดชำระ",
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
        accessorKey: "status",
        header: "สถานะ",
        cell: ({ getValue }) => <StatusBadge status={getValue<PaymentStatus>()} />,
      },
    ],
    []
  );

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
        format: (v) => TYPE_LABEL[v as ExpenseType]?.label || String(v),
      },
      {
        key: "status",
        header: "สถานะ",
        format: (v) => STATUS_LABEL[v as PaymentStatus]?.label || String(v),
      },
      {
        key: "amount",
        header: "ยอดชำระ (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
    ],
    []
  );

  return (
    <>
      {/* Export action */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "0.75rem",
        }}
      >
        <ExportButton
          data={rows}
          columns={exportColumns}
          filename={`overview_${fromIso}_${toIso}`}
          pdfTitle={`รายงานภาพรวมรายจ่าย ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
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
          sub="ยอดมากสุดในช่วง"
        />
        <StatCard
          color="green"
          icon="🧾"
          label="จำนวนรายการ"
          value={stats.count.toLocaleString("th-TH")}
          sub={
            stats.count > 0
              ? `เฉลี่ย ฿${formatTHB(stats.average)}/รายการ`
              : "ไม่มีรายการ"
          }
        />
      </div>

      <DataTable<Row>
        columns={columns}
        data={rows}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหา..."
        loading={reportQuery.isLoading}
        emptyMessage="ไม่มีรายการในช่วงเวลาและตัวกรองที่เลือก"
      />
    </>
  );
}
