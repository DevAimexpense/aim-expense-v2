"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

type Status = "draft" | "sent" | "partial" | "paid" | "void";

const STATUS_LABEL: Record<Status, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  partial: "รับบางส่วน",
  paid: "ชำระครบ",
  void: "ยกเลิก",
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569" },
  sent: { bg: "#dbeafe", fg: "#1e40af" },
  partial: { bg: "#fef3c7", fg: "#78350f" },
  paid: { bg: "#dcfce7", fg: "#166534" },
  void: { bg: "#1e293b", fg: "#e2e8f0" },
};

export function BillingStatusBadge({ status }: { status: Status }) {
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

function isOverdue(dueDate: string, status: Status, balance: number): boolean {
  if (status === "void" || status === "paid") return false;
  if (balance <= 0) return false;
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

export function BillingsClient() {
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryInput = statusFilter === "all" ? {} : { status: statusFilter };
  const listQuery = trpc.billing.list.useQuery({
    ...queryInput,
    customerId: customerFilter === "all" ? undefined : customerFilter,
    from: from || undefined,
    to: to || undefined,
  });
  const customersQuery = trpc.customer.list.useQuery();
  const customers = customersQuery.data || [];
  const rows = listQuery.data || [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === rows.length && rows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((b) => b.billingId)));
    }
  };
  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  const downloadSelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > 10) {
      if (
        !confirm(
          `เลือกไว้ ${ids.length} รายการ — browser อาจ block popup. ดำเนินการต่อไหม?`
        )
      ) {
        return;
      }
    }
    let blocked = 0;
    ids.forEach((id) => {
      const url = `/documents/billing/${id}?download=1`;
      const w = window.open(url, "_blank");
      if (!w) blocked++;
    });
    if (blocked > 0) {
      alert(
        `Browser block popup ${blocked} รายการ — กรุณาอนุญาต popup จาก site นี้แล้วลองอีกครั้ง`
      );
    }
  };

  const formatTHB = (n: number) =>
    n.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🧾 ใบวางบิล</h1>
          <p className="app-page-subtitle">
            ออกใบวางบิล / ใบแจ้งหนี้ + บันทึกรับเงิน
          </p>
        </div>
        <Link href="/billings/new" className="app-btn app-btn-primary">
          + สร้างใบวางบิล
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
          <option value="partial">{STATUS_LABEL.partial}</option>
          <option value="paid">{STATUS_LABEL.paid}</option>
          <option value="void">{STATUS_LABEL.void}</option>
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
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="app-input"
          style={{ maxWidth: "180px" }}
        />
      </div>

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.625rem 1rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "0.5rem",
            marginBottom: "0.75rem",
            position: "sticky",
            top: "0.5rem",
            zIndex: 5,
          }}
        >
          <span
            style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1e40af" }}
          >
            เลือก {selected.size} รายการ
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={downloadSelected}
            className="app-btn app-btn-primary app-btn-sm"
          >
            💾 ดาวน์โหลด PDF ({selected.size})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="app-btn app-btn-ghost app-btn-sm"
          >
            ✕ ยกเลิก
          </button>
        </div>
      )}

      {listQuery.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🧾</div>
            <p className="app-empty-title">ยังไม่มีใบวางบิล</p>
            <p className="app-empty-desc">
              สร้างใบใหม่หรือแปลงจากใบเสนอราคาที่ accepted แล้ว
            </p>
            <Link href="/billings/new" className="app-btn app-btn-primary">
              + สร้างใบแรก
            </Link>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ width: "32px" }} className="text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>เลขเอกสาร</th>
                <th>วันที่</th>
                <th>ลูกค้า</th>
                <th>โครงการ</th>
                <th className="text-center">สถานะ</th>
                <th className="text-right">ยอดรวม</th>
                <th className="text-right">รับแล้ว</th>
                <th className="text-right">คงค้าง</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const overdue = isOverdue(b.dueDate, b.status, b.balance);
                const isChecked = selected.has(b.billingId);
                return (
                  <tr key={b.billingId}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(b.billingId)}
                      />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {b.docNumber}
                    </td>
                    <td>
                      <div>{b.docDate}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ครบ {b.dueDate}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {b.customerNameSnapshot}
                      </div>
                      {b.customerTaxIdSnapshot && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748b",
                            fontFamily: "ui-monospace",
                          }}
                        >
                          {b.customerTaxIdSnapshot}
                        </div>
                      )}
                    </td>
                    <td>{b.projectName || "-"}</td>
                    <td className="text-center">
                      <BillingStatusBadge status={b.status} />
                      {overdue && (
                        <div
                          style={{
                            fontSize: "0.6875rem",
                            color: "#c2410c",
                            marginTop: "0.125rem",
                          }}
                        >
                          ⚠️ เกินกำหนด
                        </div>
                      )}
                    </td>
                    <td className="text-right num">
                      {formatTHB(b.grandTotal)}
                    </td>
                    <td className="text-right num">
                      {formatTHB(b.paidAmount)}
                    </td>
                    <td className="text-right num">{formatTHB(b.balance)}</td>
                    <td className="text-center">
                      <Link
                        href={`/billings/${b.billingId}`}
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
