"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

type Status = "draft" | "issued" | "void";

const STATUS_LABEL: Record<Status, string> = {
  draft: "ร่าง",
  issued: "ออกแล้ว",
  void: "ยกเลิก",
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569" },
  issued: { bg: "#dcfce7", fg: "#166534" },
  void: { bg: "#1e293b", fg: "#e2e8f0" },
};

export function TaxInvoiceStatusBadge({ status }: { status: Status }) {
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

export function TaxInvoicesClient() {
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryInput = statusFilter === "all" ? {} : { status: statusFilter };
  const listQuery = trpc.taxInvoice.list.useQuery({
    ...queryInput,
    customerId: customerFilter === "all" ? undefined : customerFilter,
    from: from || undefined,
    to: to || undefined,
  });
  const [shouldLoadCustomers, setShouldLoadCustomers] = useState(false);
  const customersQuery = trpc.customer.list.useQuery(undefined, {
    enabled: shouldLoadCustomers,
  });
  const customers = customersQuery.data || [];
  const rows = listQuery.data || [];

  useEffect(() => {
    if (!listQuery.isLoading && !shouldLoadCustomers) {
      const t = setTimeout(() => setShouldLoadCustomers(true), 100);
      return () => clearTimeout(t);
    }
  }, [listQuery.isLoading, shouldLoadCustomers]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const issuedRows = rows.filter((r) => r.status === "issued");
  const allChecked =
    issuedRows.length > 0 && selected.size === issuedRows.length;
  const someChecked = selected.size > 0 && selected.size < issuedRows.length;

  const toggleSelectAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(issuedRows.map((r) => r.taxInvoiceId)));
  };

  const downloadSelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > 10) {
      if (
        !confirm(
          `เลือกไว้ ${ids.length} รายการ — browser อาจ block popup. ดำเนินการต่อไหม?`,
        )
      ) {
        return;
      }
    }
    let blocked = 0;
    ids.forEach((id) => {
      const url = `/documents/tax-invoice/${id}?download=1`;
      const w = window.open(url, "_blank");
      if (!w) blocked++;
    });
    if (blocked > 0) {
      alert(
        `Browser block popup ${blocked} รายการ — กรุณาอนุญาต popup จาก site นี้แล้วลองอีกครั้ง`,
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
          <h1 className="app-page-title">🧮 ใบกำกับภาษี</h1>
          <p className="app-page-subtitle">
            ออกใบกำกับภาษีตามประมวลรัษฎากร — เลขเรียงต่อเนื่อง ห้ามข้าม + lock หลัง issue
          </p>
        </div>
        <Link href="/tax-invoices/new" className="app-btn app-btn-primary">
          + สร้างใบกำกับภาษี
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
          <option value="issued">{STATUS_LABEL.issued}</option>
          <option value="void">{STATUS_LABEL.void}</option>
        </select>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          onMouseDown={() => setShouldLoadCustomers(true)}
          onFocus={() => setShouldLoadCustomers(true)}
          className="app-select"
          style={{ minWidth: "200px" }}
        >
          <option value="all">ลูกค้า: ทั้งหมด</option>
          {customersQuery.isLoading && shouldLoadCustomers && (
            <option disabled>กำลังโหลด...</option>
          )}
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
            <div className="app-empty-icon">🧮</div>
            <p className="app-empty-title">ยังไม่มีใบกำกับภาษี</p>
            <p className="app-empty-desc">
              สร้างใบใหม่ — หรือออกจากใบเสนอราคา/ใบวางบิลที่มีอยู่
            </p>
            <Link href="/tax-invoices/new" className="app-btn app-btn-primary">
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
                    title="เลือก/ยกเลิกเฉพาะที่ออกแล้ว (issued)"
                  />
                </th>
                <th>เลขใบกำกับภาษี</th>
                <th>วันที่</th>
                <th>ลูกค้า</th>
                <th>สาขา</th>
                <th>โครงการ</th>
                <th className="text-center">สถานะ</th>
                <th className="text-right">ฐานภาษี</th>
                <th className="text-right">VAT</th>
                <th className="text-right">รวม</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isIssued = r.status === "issued";
                const isChecked = selected.has(r.taxInvoiceId);
                return (
                  <tr key={r.taxInvoiceId}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isIssued}
                        onChange={() =>
                          isIssued && toggleSelect(r.taxInvoiceId)
                        }
                        title={
                          isIssued
                            ? "เลือกเพื่อดาวน์โหลด PDF"
                            : "ดาวน์โหลดได้เฉพาะใบที่ออกแล้ว"
                        }
                      />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {r.docNumber || (
                        <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                          (ยังไม่ออกเลข)
                        </span>
                      )}
                    </td>
                    <td>{r.docDate}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {r.customerNameSnapshot}
                      </div>
                      {r.customerTaxIdSnapshot && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748b",
                            fontFamily: "ui-monospace",
                          }}
                        >
                          {r.customerTaxIdSnapshot}
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: "0.8125rem" }}>
                      {r.customerBranchSnapshot || "—"}
                    </td>
                    <td>{r.projectName || "-"}</td>
                    <td className="text-center">
                      <TaxInvoiceStatusBadge status={r.status} />
                    </td>
                    <td className="text-right num">{formatTHB(r.subtotal)}</td>
                    <td className="text-right num">{formatTHB(r.vatAmount)}</td>
                    <td className="text-right num">
                      {formatTHB(r.grandTotal)}
                    </td>
                    <td className="text-center">
                      <Link
                        href={`/tax-invoices/${r.taxInvoiceId}`}
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
