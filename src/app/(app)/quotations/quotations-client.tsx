"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

type Status = "draft" | "sent" | "accepted" | "rejected" | "void" | "converted";

const STATUS_LABEL: Record<Status, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  accepted: "ยอมรับ",
  rejected: "ปฏิเสธ",
  void: "ยกเลิก",
  converted: "แปลงเป็น Billing",
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569" },
  sent: { bg: "#dbeafe", fg: "#1e40af" },
  accepted: { bg: "#dcfce7", fg: "#166534" },
  rejected: { bg: "#fee2e2", fg: "#991b1b" },
  void: { bg: "#1e293b", fg: "#e2e8f0" },
  converted: { bg: "#ede9fe", fg: "#5b21b6" },
};

export function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "0.375rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function isExpired(validUntil: string, status: Status): boolean {
  if (status !== "sent") return false;
  if (!validUntil) return false;
  return validUntil < new Date().toISOString().slice(0, 10);
}

export function QuotationsClient() {
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const queryInput =
    statusFilter === "all"
      ? {}
      : { status: statusFilter };
  const listQuery = trpc.quotation.list.useQuery({
    ...queryInput,
    customerId: customerFilter === "all" ? undefined : customerFilter,
    from: from || undefined,
    to: to || undefined,
  });
  const customersQuery = trpc.customer.list.useQuery();
  const customers = customersQuery.data || [];
  const rows = listQuery.data || [];

  const formatTHB = (n: number) =>
    n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📜 ใบเสนอราคา</h1>
          <p className="app-page-subtitle">
            สร้างและจัดการใบเสนอราคา (Quotation) ให้กับลูกค้า
          </p>
        </div>
        <Link href="/quotations/new" className="app-btn app-btn-primary">
          + สร้างใบเสนอราคา
        </Link>
      </div>

      <div
        className="app-filter-row"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
      >
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
          className="app-select"
          style={{ minWidth: "140px" }}
        >
          <option value="all">สถานะ: ทั้งหมด</option>
          <option value="draft">{STATUS_LABEL.draft}</option>
          <option value="sent">{STATUS_LABEL.sent}</option>
          <option value="accepted">{STATUS_LABEL.accepted}</option>
          <option value="rejected">{STATUS_LABEL.rejected}</option>
          <option value="void">{STATUS_LABEL.void}</option>
          <option value="converted">{STATUS_LABEL.converted}</option>
        </select>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="app-select"
          style={{ minWidth: "200px" }}
        >
          <option value="all">ลูกค้า: ทั้งหมด</option>
          {customers.map((c) => (
            <option key={c.customerId} value={c.customerId}>
              {c.customerName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="app-input"
          style={{ maxWidth: "180px" }}
          placeholder="ตั้งแต่"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="app-input"
          style={{ maxWidth: "180px" }}
          placeholder="ถึง"
        />
      </div>

      {listQuery.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">📜</div>
            <p className="app-empty-title">ยังไม่มีใบเสนอราคา</p>
            <p className="app-empty-desc">
              สร้างใบแรกเพื่อเสนอราคาให้ลูกค้า
            </p>
            <Link href="/quotations/new" className="app-btn app-btn-primary">
              + สร้างใบแรก
            </Link>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>เลขเอกสาร</th>
                <th>วันที่</th>
                <th>ลูกค้า</th>
                <th>โครงการ</th>
                <th className="text-center">สถานะ</th>
                <th className="text-right">ยอดรวม</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const expired = isExpired(q.validUntil, q.status);
                return (
                  <tr key={q.quotationId}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {q.docNumber}
                    </td>
                    <td>
                      <div>{q.docDate}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ใช้ได้ถึง {q.validUntil}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {q.customerNameSnapshot}
                      </div>
                      {q.customerTaxIdSnapshot && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748b",
                            fontFamily: "ui-monospace",
                          }}
                        >
                          {q.customerTaxIdSnapshot}
                        </div>
                      )}
                    </td>
                    <td>{q.projectName || "-"}</td>
                    <td className="text-center">
                      <StatusBadge status={q.status} />
                      {expired && (
                        <div
                          style={{
                            fontSize: "0.6875rem",
                            color: "#c2410c",
                            marginTop: "0.125rem",
                          }}
                        >
                          ⚠️ หมดอายุ
                        </div>
                      )}
                    </td>
                    <td className="text-right num">{formatTHB(q.grandTotal)}</td>
                    <td className="text-center">
                      <Link
                        href={`/quotations/${q.quotationId}`}
                        className="app-btn app-btn-ghost app-btn-sm"
                      >
                        ดู →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="app-card">
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="app-skeleton" style={{ height: "50px" }} />
        ))}
      </div>
    </div>
  );
}
