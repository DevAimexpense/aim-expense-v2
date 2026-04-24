"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { PaymentModal } from "../payments/payment-modal";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

export default function ApprovalsPage() {
  const utils = trpc.useUtils();
  const paymentsQuery = trpc.payment.list.useQuery({ status: "pending" });
  const eventsQuery = trpc.event.list.useQuery();
  const payeesQuery = trpc.payee.list.useQuery();

  const payments = paymentsQuery.data || [];
  const events = eventsQuery.data || [];
  const payees = payeesQuery.data || [];

  // Payment detail modal (view mode)
  const [viewPaymentId, setViewPaymentId] = useState<string | null>(null);
  const viewPayment = payments.find((p) => p.paymentId === viewPaymentId);

  const eventMap = useMemo(
    () => Object.fromEntries(events.map((e) => [e.eventId, e.eventName])),
    [events]
  );
  const payeeMap = useMemo(
    () => Object.fromEntries(payees.map((p) => [p.payeeId, p.payeeName])),
    [payees]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState("all");
  const [filterEventId, setFilterEventId] = useState("all");
  const [filterPayeeId, setFilterPayeeId] = useState("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(todayISO());

  const approveMut = trpc.payment.approve.useMutation();
  const rejectMut = trpc.payment.reject.useMutation();

  const hasAnyFilter = filterType !== "all" || filterEventId !== "all" || filterPayeeId !== "all" || dueDateFrom || dueDateTo || search;
  const clearFilters = () => {
    setFilterType("all");
    setFilterEventId("all");
    setFilterPayeeId("all");
    setDueDateFrom("");
    setDueDateTo("");
    setSearch("");
  };

  const filtered = payments.filter((p) => {
    if (filterType !== "all" && p.expenseType !== filterType) return false;
    if (filterEventId !== "all" && p.eventId !== filterEventId) return false;
    if (filterPayeeId !== "all" && p.payeeId !== filterPayeeId) return false;
    if (dueDateFrom && p.dueDate < dueDateFrom) return false;
    if (dueDateTo && p.dueDate > dueDateTo) return false;
    if (search) {
      const s = search.toLowerCase();
      const desc = p.description.toLowerCase();
      const payee = (payeeMap[p.payeeId] || "").toLowerCase();
      const event = (eventMap[p.eventId] || "").toLowerCase();
      const creator = (p.createdBy || "").toLowerCase();
      if (!desc.includes(s) && !payee.includes(s) && !event.includes(s) && !creator.includes(s)) return false;
    }
    return true;
  });

  const allIds = filtered.map((p) => p.paymentId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const selectedList = filtered.filter((p) => selected.has(p.paymentId));
  const selectedTotal = selectedList.reduce((s, p) => s + p.gttlAmount, 0);

  const handleApproveWithDate = async () => {
    if (selected.size === 0 || !paymentDate) return;
    try {
      await approveMut.mutateAsync({
        paymentIds: Array.from(selected),
        paymentDate,
      });
      setSelected(new Set());
      setShowApprove(false);
      utils.payment.list.invalidate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleReject = async () => {
    if (selected.size === 0) return;
    try {
      await rejectMut.mutateAsync({
        paymentIds: Array.from(selected),
        reason: rejectReason.trim() || undefined,
      });
      setSelected(new Set());
      setShowReject(false);
      setRejectReason("");
      utils.payment.list.invalidate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">✅ อนุมัติรายการ</h1>
          <p className="app-page-subtitle">
            ตรวจสอบและอนุมัติรายการจ่ายที่รอการอนุมัติ
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="app-stats-grid">
        <div className="app-stat-card gradient-amber">
          <div className="app-stat-icon amber">⏳</div>
          <p className="app-stat-label">รอตรวจทั้งหมด</p>
          <p className="app-stat-value-sm">{payments.length}</p>
        </div>
        <div className="app-stat-card gradient-blue">
          <div className="app-stat-icon blue">✔</div>
          <p className="app-stat-label">เลือกแล้ว</p>
          <p className="app-stat-value-sm">{selected.size}</p>
        </div>
        <div className="app-stat-card gradient-green">
          <div className="app-stat-icon green">💰</div>
          <p className="app-stat-label">ยอดรวมที่เลือก</p>
          <p className="app-stat-value-sm">฿{formatNumber(selectedTotal)}</p>
        </div>
        <div className="app-stat-card gradient-rose">
          <div className="app-stat-icon rose">📋</div>
          <p className="app-stat-label">ยอดรวมทั้งหมด</p>
          <p className="app-stat-value-sm">
            ฿{formatNumber(payments.reduce((s, p) => s + p.gttlAmount, 0))}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="app-card no-print" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#334155", margin: 0 }}>🔍 ตัวกรอง</p>
          {hasAnyFilter && (
            <button onClick={clearFilters} className="app-btn app-btn-ghost app-btn-sm">ล้างตัวกรอง</button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🔍 ค้นหา</label>
            <input
              type="text"
              placeholder="รายละเอียด / ผู้รับเงิน / โปรเจกต์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>📂 ประเภท</label>
            <SearchableSelect
              options={[
                { value: "all", label: "ทุกประเภท" },
                { value: "team", label: "เบิกเงินสด" },
                { value: "account", label: "โอนบัญชี" },
              ]}
              value={filterType}
              onChange={(val) => setFilterType(val)}
              className="app-select"
              emptyLabel="ทุกประเภท"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🎯 โปรเจกต์</label>
            <SearchableSelect
              options={[
                { value: "all", label: "ทุกโปรเจกต์" },
                ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
              ]}
              value={filterEventId}
              onChange={(val) => setFilterEventId(val)}
              className="app-select"
              emptyLabel="ทุกโปรเจกต์"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>👤 ผู้รับเงิน</label>
            <SearchableSelect
              options={[
                { value: "all", label: "ทุกผู้รับเงิน" },
                ...payees.map((p) => ({ value: p.payeeId, label: p.payeeName })),
              ]}
              value={filterPayeeId}
              onChange={(val) => setFilterPayeeId(val)}
              className="app-select"
              emptyLabel="ทุกผู้รับเงิน"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>⏰ Due Date ตั้งแต่</label>
            <input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="app-input" />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>⏰ Due Date ถึง</label>
            <input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="app-input" />
          </div>
        </div>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <button
            onClick={() => setShowApprove(true)}
            disabled={approveMut.isPending}
            className="app-btn app-btn-primary"
            style={{ marginLeft: "auto" }}
          >
            ✅ อนุมัติ + เลือกวันจ่าย ({selected.size})
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={rejectMut.isPending}
            className="app-btn app-btn-secondary"
            style={{ color: "#dc2626", borderColor: "#fecaca" }}
          >
            ❌ ปฏิเสธ
          </button>
        </div>
      )}

      {paymentsQuery.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">✅</div>
            <p className="app-empty-title">ไม่มีรายการรอตรวจ</p>
            <p className="app-empty-desc">รายการทั้งหมดได้รับการตรวจสอบแล้ว</p>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ width: "2.5rem" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th>รายละเอียด</th>
                <th>โปรเจกต์</th>
                <th>ผู้รับเงิน</th>
                <th>ประเภท</th>
                <th className="text-right">ยอดชำระ</th>
                <th>Due Date</th>
                <th>สร้างโดย</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isSel = selected.has(p.paymentId);
                return (
                  <tr
                    key={p.paymentId}
                    style={{
                      background: isSel ? "#eff6ff" : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(p.paymentId)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td
                      onClick={() => setViewPaymentId(p.paymentId)}
                      style={{ cursor: "pointer" }}
                      title="คลิกเพื่อดูรายละเอียด"
                    >
                      <div style={{ fontWeight: 500, color: "#2563eb" }}>
                        {p.description} 👁
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        TTL ฿{formatNumber(p.ttlAmount)}
                        {p.wthAmount > 0
                          ? ` - WTH ฿${formatNumber(p.wthAmount)}`
                          : ""}
                        {p.vatAmount > 0
                          ? ` + VAT ฿${formatNumber(p.vatAmount)}`
                          : ""}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {eventMap[p.eventId] || "-"}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {payeeMap[p.payeeId] || "-"}
                    </td>
                    <td>
                      <span
                        className={`app-badge ${
                          p.expenseType === "team"
                            ? "app-badge-warning"
                            : "app-badge-info"
                        }`}
                      >
                        {p.expenseType === "team" ? "💵 เงินสด" : "🏦 โอน"}
                      </span>
                    </td>
                    <td className="text-right num" style={{ fontWeight: 600 }}>
                      ฿{formatNumber(p.gttlAmount)}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {formatDate(p.dueDate)}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {p.createdBy}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve + Pick Payment Date Modal */}
      {showApprove && (
        <div
          className="app-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setShowApprove(false)}
        >
          <div className="app-modal">
            <div className="app-modal-header">
              <h3 className="app-modal-title">✅ อนุมัติ + เลือกวันจ่าย</h3>
              <button
                type="button"
                onClick={() => setShowApprove(false)}
                className="app-btn app-btn-ghost app-btn-icon"
              >
                ✕
              </button>
            </div>
            <div className="app-modal-body">
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "0.875rem 1rem",
                  borderRadius: "0.5rem",
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                }}
              >
                <p style={{ margin: 0, fontWeight: 500, color: "#1e3a8a" }}>
                  อนุมัติ {selected.size} รายการ • ยอดรวม ฿{formatNumber(selectedTotal)}
                </p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#475569" }}>
                  หลังอนุมัติ รายการจะไปปรากฏในหน้า <b>เตรียมจ่าย</b> ตามวันที่กำหนด
                </p>
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  วันที่จ่ายเงิน (Scheduled)
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="app-input"
                />
                <p className="app-hint">
                  วันที่กำหนดจะจ่ายเงินจริง — ใช้จัด batch การจ่ายในหน้าเตรียมจ่าย
                </p>
              </div>
            </div>
            <div className="app-modal-footer">
              <button
                onClick={() => setShowApprove(false)}
                className="app-btn app-btn-secondary"
                disabled={approveMut.isPending}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleApproveWithDate}
                disabled={!paymentDate || approveMut.isPending}
                className="app-btn app-btn-primary"
              >
                {approveMut.isPending ? (
                  <>
                    <span className="app-spinner" /> กำลังอนุมัติ...
                  </>
                ) : (
                  "✅ ยืนยันอนุมัติ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal (read-only) */}
      {viewPaymentId && viewPayment && (
        <PaymentModal
          payment={viewPayment}
          events={events}
          payees={payees}
          onClose={() => setViewPaymentId(null)}
          onSuccess={() => {
            setViewPaymentId(null);
            utils.payment.list.invalidate();
          }}
        />
      )}

      {/* Reject Modal */}
      {showReject && (
        <div
          className="app-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setShowReject(false)}
        >
          <div className="app-modal">
            <div className="app-modal-header">
              <h3 className="app-modal-title">
                ปฏิเสธ {selected.size} รายการ
              </h3>
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="app-btn app-btn-ghost app-btn-icon"
              >
                ✕
              </button>
            </div>
            <div className="app-modal-body">
              <div className="app-form-group">
                <label className="app-label">เหตุผล (ไม่บังคับ)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="ระบุเหตุผลเพื่อให้ผู้เบิกทราบ"
                  className="app-textarea"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
            <div className="app-modal-footer">
              <button
                onClick={() => setShowReject(false)}
                className="app-btn app-btn-secondary"
                disabled={rejectMut.isPending}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReject}
                disabled={rejectMut.isPending}
                className="app-btn app-btn-danger"
              >
                {rejectMut.isPending ? (
                  <>
                    <span className="app-spinner" /> กำลังดำเนินการ...
                  </>
                ) : (
                  "❌ ปฏิเสธ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(s: string): string {
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
