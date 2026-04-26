// ===========================================
// Reports tab: แยกผู้รับเงิน (By Vendor)
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
import { formatTHB, formatThaiDate } from "./_components";

type VendorRow = {
  payeeId: string;
  payeeName: string;
  taxId: string;
  branchInfo: string;
  totalSpent: number;
  paymentCount: number;
  lastPaymentDate: string;
};

export type ByVendorTabData = {
  stats: {
    vendorCount: number;
    totalSpent: number;
    topVendorAmount: number;
    averagePerVendor: number;
  };
  vendors: VendorRow[];
};

interface Props {
  fromIso: string;
  toIso: string;
  data: ByVendorTabData | undefined;
  isLoading: boolean;
}

export function ByVendorTab({ fromIso, toIso, data, isLoading }: Props) {
  const stats = data?.stats ?? {
    vendorCount: 0,
    totalSpent: 0,
    topVendorAmount: 0,
    averagePerVendor: 0,
  };
  const vendors: VendorRow[] = data?.vendors ?? [];
  const topVendor = vendors[0];

  const columns = useMemo<ColumnDef<VendorRow, unknown>[]>(
    () => [
      {
        accessorKey: "payeeName",
        header: "ผู้รับเงิน",
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 500 }}>{row.original.payeeName}</div>
            {(row.original.taxId || row.original.branchInfo) && (
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#94a3b8",
                  marginTop: "0.125rem",
                }}
              >
                {row.original.taxId ? `เลขผู้เสียภาษี ${row.original.taxId}` : ""}
                {row.original.taxId && row.original.branchInfo ? " • " : ""}
                {row.original.branchInfo}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "paymentCount",
        header: "จำนวนรายการ",
        cell: ({ getValue }) => (
          <span className="num" style={{ display: "block", textAlign: "right" }}>
            {getValue<number>().toLocaleString("th-TH")}
          </span>
        ),
      },
      {
        accessorKey: "totalSpent",
        header: "ยอดรวม",
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
        accessorKey: "lastPaymentDate",
        header: "ล่าสุด",
        cell: ({ getValue }) => (
          <span className="num">{formatThaiDate(getValue<string>())}</span>
        ),
      },
    ],
    []
  );

  const exportColumns = useMemo<ExportColumn<VendorRow>[]>(
    () => [
      { key: "payeeName", header: "ผู้รับเงิน" },
      { key: "taxId", header: "เลขผู้เสียภาษี" },
      { key: "branchInfo", header: "สาขา" },
      { key: "paymentCount", header: "จำนวนรายการ" },
      {
        key: "totalSpent",
        header: "ยอดรวม (บาท)",
        format: (v) => formatTHB(Number(v)),
      },
      {
        key: "lastPaymentDate",
        header: "ล่าสุด",
        format: (v) => formatThaiDate(v as string),
      },
    ],
    []
  );

  const topShare =
    stats.totalSpent > 0
      ? (stats.topVendorAmount / stats.totalSpent) * 100
      : 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "0.75rem",
        }}
      >
        <ExportButton
          data={vendors}
          columns={exportColumns}
          filename={`by-vendor_${fromIso}_${toIso}`}
          pdfTitle={`รายงานแยกผู้รับเงิน ${formatThaiDate(fromIso)} – ${formatThaiDate(toIso)}`}
          pdfOrientation="landscape"
          hideWhenEmpty
        />
      </div>

      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="🤝"
          label="ผู้รับเงินทั้งหมด"
          value={stats.vendorCount.toLocaleString("th-TH")}
          sub="ที่มีรายการในช่วงนี้"
        />
        <StatCard
          color="amber"
          icon="💸"
          label="ยอดจ่ายรวม"
          value={`฿${formatTHB(stats.totalSpent)}`}
          sub={
            stats.vendorCount > 0
              ? `เฉลี่ย ฿${formatTHB(stats.averagePerVendor)}/ราย`
              : "—"
          }
        />
        <StatCard
          color="violet"
          icon="🏆"
          label="ผู้รับเงินสูงสุด"
          value={`฿${formatTHB(stats.topVendorAmount)}`}
          sub={
            topVendor
              ? `${topVendor.payeeName} (${topShare.toFixed(1)}%)`
              : "—"
          }
        />
        <StatCard
          color="green"
          icon="📊"
          label="เฉลี่ยต่อราย"
          value={`฿${formatTHB(stats.averagePerVendor)}`}
          sub="ของผู้รับเงินที่มีรายการ"
        />
      </div>

      <DataTable<VendorRow>
        columns={columns}
        data={vendors}
        pageSize={25}
        searchable
        searchPlaceholder="ค้นหาชื่อผู้รับเงิน / เลขผู้เสียภาษี..."
        loading={isLoading}
        emptyMessage="ไม่มีผู้รับเงินที่มีรายการในช่วงเวลานี้"
      />
    </>
  );
}
