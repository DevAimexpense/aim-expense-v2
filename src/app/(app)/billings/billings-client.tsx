"use client";

import { useEffect, useState } from "react";
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

export function BillingsClient({ entityType = "company" }: { entityType?: string }) {
  const isPersonal = entityType === "personal";
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showQuickIncome, setShowQuickIncome] = useState(false);

  const queryInput = statusFilter === "all" ? {} : { status: statusFilter };
  const listQuery = trpc.billing.list.useQuery({
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
          <h1 className="app-page-title">
            {isPersonal ? "💰 รายรับ" : "🧾 ใบวางบิล"}
          </h1>
          <p className="app-page-subtitle">
            {isPersonal
              ? "บันทึกรายรับ + ใบหัก ณ ที่จ่าย (50ทวิ)"
              : "ออกใบวางบิล / ใบแจ้งหนี้ + บันทึกรับเงิน"}
          </p>
        </div>
        {isPersonal ? (
          <button
            onClick={() => setShowQuickIncome(true)}
            className="app-btn app-btn-primary"
          >
            + บันทึกรายรับ
          </button>
        ) : (
          <Link href="/billings/new" className="app-btn app-btn-primary">
            + สร้างใบวางบิล
          </Link>
        )}
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
            <div className="app-empty-icon">{isPersonal ? "💰" : "🧾"}</div>
            <p className="app-empty-title">
              {isPersonal ? "ยังไม่มีรายรับ" : "ยังไม่มีใบวางบิล"}
            </p>
            <p className="app-empty-desc">
              {isPersonal
                ? "เริ่มบันทึกรายรับพร้อมแนบใบหัก ณ ที่จ่าย (50ทวิ)"
                : "สร้างใบใหม่หรือแปลงจากใบเสนอราคาที่ accepted แล้ว"}
            </p>
            {isPersonal ? (
              <button
                onClick={() => setShowQuickIncome(true)}
                className="app-btn app-btn-primary"
              >
                + บันทึกรายรับ
              </button>
            ) : (
              <Link href="/billings/new" className="app-btn app-btn-primary">
                + สร้างใบแรก
              </Link>
            )}
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
                <th>{isPersonal ? "ผู้จ่าย" : "ลูกค้า"}</th>
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

      {showQuickIncome && (
        <QuickIncomeModal
          payers={Array.from(
            new Map(
              rows
                .filter((r) => (r.customerNameSnapshot || "").trim())
                .map((r) => [
                  r.customerNameSnapshot.trim(),
                  {
                    name: r.customerNameSnapshot.trim(),
                    taxId: (r.customerTaxIdSnapshot || "").trim(),
                  },
                ]),
            ).values(),
          )}
          onClose={() => setShowQuickIncome(false)}
          onSuccess={() => {
            setShowQuickIncome(false);
            listQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

// Income types for individuals (มาตรา 40) with the default WHT rate each one
// usually carries. Salary (40(1)) is stepped, so it's entered as a baht amount
// rather than a percent.
const INCOME_TYPES: {
  value: string;
  label: string;
  pct: string;
  salary?: boolean;
}[] = [
  { value: "service", label: "🛠 รับจ้าง / บริการ / วิชาชีพ (ม.40(2)(6))", pct: "3" },
  { value: "salary", label: "💼 เงินเดือน / ค่าจ้าง (ม.40(1))", pct: "0", salary: true },
  { value: "rent", label: "🏠 ค่าเช่า (ม.40(5))", pct: "5" },
  { value: "transport", label: "🚚 ค่าขนส่ง", pct: "1" },
  { value: "other", label: "✏️ อื่นๆ", pct: "0" },
];

function QuickIncomeModal({
  payers,
  onClose,
  onSuccess,
}: {
  payers: { name: string; taxId: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const quickMut = trpc.billing.quickIncome.useMutation();
  // รายรับฝั่งบุคคลต้องผูกโปรเจกต์ (ก้อนเงิน) → ดึงรายการโปรเจกต์มาให้เลือก
  const eventsQuery = trpc.event.list.useQuery();
  const activeEvents = (eventsQuery.data || []).filter(
    (e) => (e.status || "active") !== "completed" && (e.status || "active") !== "cancelled",
  );
  const [form, setForm] = useState({
    eventId: "",
    payerName: "",
    payerTaxId: "",
    docDate: new Date().toISOString().slice(0, 10),
    amount: "",
    incomeType: "service",
    whtPercent: "3",
    whtBaht: "", // ยอดภาษีหัก (บาท) — ใช้กับเงินเดือน (หักขั้นบันได)
    notes: "",
  });

  const isSalary =
    INCOME_TYPES.find((t) => t.value === form.incomeType)?.salary === true;

  // Switching income type pre-fills the typical WHT rate for that category.
  const onIncomeTypeChange = (value: string) => {
    const t = INCOME_TYPES.find((x) => x.value === value);
    setForm((f) => ({ ...f, incomeType: value, whtPercent: t?.pct ?? "0" }));
  };

  // Picking a known payer name auto-fills their tax ID (repeat clients →
  // no re-typing the 13-digit number).
  const onPayerNameChange = (name: string) => {
    const match = payers.find((p) => p.name === name.trim());
    setForm((f) => ({
      ...f,
      payerName: name,
      payerTaxId: match && match.taxId ? match.taxId : f.payerTaxId,
    }));
  };
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountNum = parseFloat(form.amount) || 0;
  const whtNum = parseFloat(form.whtPercent) || 0;
  const whtAmount = isSalary
    ? Math.round((parseFloat(form.whtBaht) || 0) * 100) / 100
    : Math.round(((amountNum * whtNum) / 100) * 100) / 100;
  const net = Math.round((amountNum - whtAmount) * 100) / 100;

  const fmt = (n: number) =>
    n.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.eventId) {
      setError("กรุณาเลือกโปรเจกต์ (ก้อนเงินที่จะเบิกใช้)");
      return;
    }
    if (!form.payerName.trim()) {
      setError("กรุณากรอกชื่อผู้จ่าย");
      return;
    }
    if (amountNum <= 0) {
      setError("จำนวนเงินต้องมากกว่า 0");
      return;
    }
    setBusy(true);
    try {
      const res = await quickMut.mutateAsync({
        eventId: form.eventId,
        eventName:
          activeEvents.find((e) => e.eventId === form.eventId)?.eventName ||
          undefined,
        payerName: form.payerName.trim(),
        payerTaxId: form.payerTaxId.trim() || undefined,
        docDate: form.docDate,
        amount: amountNum,
        whtPercent: isSalary ? 0 : whtNum,
        whtAmount: isSalary ? whtAmount : undefined,
        incomeType: form.incomeType,
        notes: form.notes.trim() || undefined,
      });
      // Attach the WHT cert (50ทวิ) if provided — best-effort, after the row exists.
      if (file && res.billingId) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("billingId", res.billingId);
        const up = await fetch("/api/billings/upload", {
          method: "POST",
          body: fd,
        });
        if (!up.ok) {
          const data = await up.json().catch(() => ({}));
          setError(
            `บันทึกรายรับแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${data.error || "ลองใหม่ที่หน้ารายละเอียด"}`,
          );
          setBusy(false);
          return;
        }
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setBusy(false);
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="app-modal modal-lg">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">💰 บันทึกรายรับ</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="app-btn app-btn-ghost app-btn-icon"
            >
              ✕
            </button>
          </div>

          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}

            {/* โปรเจกต์ = ก้อนเงินที่รายรับนี้เข้า แล้วจะเบิกใช้ทีหลัง */}
            <div className="app-form-group">
              <label className="app-label app-label-required">
                เข้าโปรเจกต์ (ก้อนเงิน)
              </label>
              {eventsQuery.isLoading ? (
                <p className="app-hint">กำลังโหลดโปรเจกต์...</p>
              ) : activeEvents.length === 0 ? (
                <div className="app-hint">
                  ยังไม่มีโปรเจกต์ — สร้างก่อนเพื่อบันทึกรายรับ:{" "}
                  <a href="/events" style={{ color: "#2563eb" }}>
                    + สร้างโปรเจกต์
                  </a>
                </div>
              ) : (
                <select
                  value={form.eventId}
                  onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  className="app-input"
                >
                  <option value="">— เลือกโปรเจกต์ —</option>
                  {activeEvents.map((ev) => (
                    <option key={ev.eventId} value={ev.eventId}>
                      {ev.eventName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">ผู้จ่าย</label>
                <input
                  type="text"
                  value={form.payerName}
                  onChange={(e) => onPayerNameChange(e.target.value)}
                  placeholder="ชื่อผู้จ่ายเงิน / บริษัทผู้ว่าจ้าง"
                  className="app-input"
                  maxLength={200}
                  list="quick-income-payers"
                  autoFocus
                  autoComplete="off"
                />
                {payers.length > 0 && (
                  <datalist id="quick-income-payers">
                    {payers.map((p) => (
                      <option key={p.name} value={p.name} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="app-form-group">
                <label className="app-label">เลขผู้เสียภาษีผู้จ่าย</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.payerTaxId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      payerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13),
                    })
                  }
                  placeholder="(ไม่บังคับ)"
                  className="app-input mono"
                  maxLength={13}
                />
              </div>
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">วันที่รับเงิน</label>
                <input
                  type="date"
                  value={form.docDate}
                  onChange={(e) => setForm({ ...form, docDate: e.target.value })}
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  จำนวนเงิน (ก่อนหัก)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="app-input num"
                />
              </div>
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">ประเภทเงินได้</label>
                <select
                  value={form.incomeType}
                  onChange={(e) => onIncomeTypeChange(e.target.value)}
                  className="app-input"
                >
                  {INCOME_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="app-form-group">
                {isSalary ? (
                  <>
                    <label className="app-label">ภาษีหัก ณ ที่จ่าย (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.whtBaht}
                      onChange={(e) => setForm({ ...form, whtBaht: e.target.value })}
                      placeholder="กรอกจากสลิปเงินเดือน"
                      className="app-input num"
                    />
                  </>
                ) : (
                  <>
                    <label className="app-label">หัก ณ ที่จ่าย (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="15"
                      value={form.whtPercent}
                      onChange={(e) => setForm({ ...form, whtPercent: e.target.value })}
                      className="app-input num"
                    />
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                padding: "0.75rem 1rem",
                background: "#f8fafc",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                marginBottom: "0.75rem",
              }}
            >
              <span>หัก ณ ที่จ่าย: ฿{fmt(whtAmount)}</span>
              <span style={{ fontWeight: 700 }}>รับสุทธิ: ฿{fmt(net)}</span>
            </div>

            <div className="app-form-group">
              <label className="app-label">รายละเอียด</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="เช่น ค่าออกแบบเว็บไซต์ เดือน พ.ค."
                className="app-input"
                maxLength={500}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label">ใบหัก ณ ที่จ่าย (50ทวิ)</label>
              <p className="app-hint">แนบไฟล์ภาพหรือ PDF ที่ผู้จ่ายออกให้ (ไม่บังคับ)</p>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="app-input"
              />
            </div>
          </div>

          <div className="app-modal-footer">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button type="submit" disabled={busy} className="app-btn app-btn-primary">
              {busy ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : (
                "บันทึกรายรับ"
              )}
            </button>
          </div>
        </form>
      </div>
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
