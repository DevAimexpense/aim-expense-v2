"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { PaymentModal } from "../payments/payment-modal";
import { UploadReceiptModal } from "./upload-receipt-modal";
import { ManualReceiptModal } from "./manual-receipt-modal";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

// ===== Status / Type labels =====
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอตรวจ", cls: "app-badge-warning" },
  approved: { label: "อนุมัติแล้ว", cls: "app-badge-info" },
  paid: { label: "จ่ายแล้ว", cls: "app-badge-success" },
  rejected: { label: "ปฏิเสธ", cls: "app-badge-error" },
  cleared: { label: "เคลียร์แล้ว", cls: "app-badge-success" },
};

const TYPE_LABEL: Record<string, { label: string; cls: string; icon: string }> = {
  team: { label: "เบิกเงินสด", cls: "app-badge-warning", icon: "💵" },
  account: { label: "โอนบัญชี", cls: "app-badge-info", icon: "🏦" },
};

export default function ExpensesPage() {
  const utils = trpc.useUtils();
  const paymentsQuery = trpc.payment.list.useQuery();
  const eventsQuery = trpc.event.list.useQuery();
  const payeesQuery = trpc.payee.list.useQuery();

  const payments = paymentsQuery.data || [];
  const events = eventsQuery.data || [];
  const payees = payeesQuery.data || [];

  // Modals
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [viewPaymentId, setViewPaymentId] = useState<string | null>(null);
  const [attachPaymentId, setAttachPaymentId] = useState<string | null>(null);
  const [attachChoiceId, setAttachChoiceId] = useState<string | null>(null); // show choice dialog
  const [attachMode, setAttachMode] = useState<"upload" | "manual" | null>(null); // chosen mode

  // Filters (ชุดเดียวกับ payment-prep)
  const [search, setSearch] = useState("");
  const [filterEventId, setFilterEventId] = useState("all");
  const [filterPayeeId, setFilterPayeeId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [filterReceipt, setFilterReceipt] = useState("all"); // all | missing | has

  const eventMap = useMemo(
    () => Object.fromEntries(events.map((e) => [e.eventId, e.eventName])),
    [events]
  );
  const payeeMap = useMemo(
    () => Object.fromEntries(payees.map((p) => [p.payeeId, p.payeeName])),
    [payees]
  );

  const hasAnyFilter =
    search || filterEventId !== "all" || filterPayeeId !== "all" ||
    filterStatus !== "all" || filterType !== "all" ||
    dueDateFrom || dueDateTo || filterReceipt !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterEventId("all");
    setFilterPayeeId("all");
    setFilterStatus("all");
    setFilterType("all");
    setDueDateFrom("");
    setDueDateTo("");
    setFilterReceipt("all");
  };

  const filtered = payments
    .filter((p) => {
      if (filterEventId !== "all" && p.eventId !== filterEventId) return false;
      if (filterPayeeId !== "all" && p.payeeId !== filterPayeeId) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterType !== "all" && p.expenseType !== filterType) return false;
      if (dueDateFrom && p.dueDate < dueDateFrom) return false;
      if (dueDateTo && p.dueDate > dueDateTo) return false;
      if (filterReceipt === "missing" && p.receiptUrl) return false;
      if (filterReceipt === "has" && !p.receiptUrl) return false;
      if (search) {
        const s = search.toLowerCase();
        const desc = p.description.toLowerCase();
        const payee = (payeeMap[p.payeeId] || "").toLowerCase();
        const event = (eventMap[p.eventId] || "").toLowerCase();
        if (!desc.includes(s) && !payee.includes(s) && !event.includes(s)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Stats
  const missingReceipt = payments.filter(
    (p) => (p.status === "paid" || p.status === "cleared") && !p.receiptUrl
  ).length;
  const totalFiltered = filtered.reduce((s, p) => s + p.gttlAmount, 0);

  const viewPayment = payments.find((p) => p.paymentId === viewPaymentId);

  const refreshAll = () => {
    utils.payment.list.invalidate();
    utils.event.list.invalidate();
    utils.payee.list.invalidate();
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🧾 บันทึกค่าใช้จ่าย</h1>
          <p className="app-page-subtitle">
            บันทึกค่าใช้จ่ายที่จ่ายแล้ว แนบใบเสร็จ/ใบกำกับภาษี หรือเพิ่มรายการใหม่
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="app-btn app-btn-secondary"
            onClick={() => setShowManual(true)}
            title="บันทึกค่าใช้จ่ายที่ไม่มีใบเสร็จ — ใช้สำเนาบัตรประชาชน หรือใบรับรองแทน"
          >
            📝 ไม่มีใบเสร็จ
          </button>
          <button
            className="app-btn app-btn-primary"
            onClick={() => setShowUpload(true)}
            title="อัปโหลดใบเสร็จ/ใบกำกับภาษี → ระบบอ่านข้อมูลครบทุก field"
          >
            📤 อัปโหลดใบเสร็จ
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="app-stats-grid">
        <div className="app-stat-card gradient-blue">
          <div className="app-stat-icon blue">📋</div>
          <p className="app-stat-label">ทั้งหมด (ที่แสดง)</p>
          <p className="app-stat-value-sm">{filtered.length}</p>
        </div>
        <div className="app-stat-card gradient-amber">
          <div className="app-stat-icon amber">⚠️</div>
          <p className="app-stat-label">ยังไม่มีใบเสร็จ</p>
          <p className="app-stat-value-sm">{missingReceipt}</p>
          <p className="app-stat-sub">รายการที่จ่ายแล้ว</p>
        </div>
        <div className="app-stat-card gradient-green">
          <div className="app-stat-icon green">✅</div>
          <p className="app-stat-label">มีใบเสร็จแล้ว</p>
          <p className="app-stat-value-sm">
            {payments.filter((p) => !!p.receiptUrl).length}
          </p>
        </div>
        <div className="app-stat-card gradient-rose">
          <div className="app-stat-icon rose">💵</div>
          <p className="app-stat-label">ยอดรวม (ที่แสดง)</p>
          <p className="app-stat-value-sm">฿{formatNumber(totalFiltered)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="app-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#334155", margin: 0 }}>🔍 ตัวกรอง</p>
          {hasAnyFilter && (
            <button onClick={clearFilters} className="app-btn app-btn-ghost app-btn-sm">ล้างตัวกรอง</button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🔍 ค้นหา</label>
            <input
              type="text"
              placeholder="รายละเอียด / ผู้รับเงิน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🎯 โปรเจกต์</label>
            <SearchableSelect
              value={filterEventId}
              onChange={(val) => setFilterEventId(val)}
              className="app-select"
              options={events.map((e) => ({ value: e.eventId, label: e.eventName }))}
              emptyLabel="ทุกโปรเจกต์"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>👤 ผู้รับเงิน</label>
            <SearchableSelect
              value={filterPayeeId}
              onChange={(val) => setFilterPayeeId(val)}
              className="app-select"
              options={payees.map((p) => ({ value: p.payeeId, label: p.payeeName }))}
              emptyLabel="ทุกผู้รับเงิน"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>📂 สถานะ</label>
            <SearchableSelect
              value={filterStatus}
              onChange={(val) => setFilterStatus(val)}
              className="app-select"
              options={[
                { value: "pending", label: "รอตรวจ" },
                { value: "approved", label: "อนุมัติแล้ว" },
                { value: "paid", label: "จ่ายแล้ว" },
                { value: "cleared", label: "เคลียร์แล้ว" },
              ]}
              emptyLabel="ทุกสถานะ"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>📂 ประเภท</label>
            <SearchableSelect
              value={filterType}
              onChange={(val) => setFilterType(val)}
              className="app-select"
              options={[
                { value: "team", label: "เบิกเงินสด" },
                { value: "account", label: "โอนบัญชี" },
              ]}
              emptyLabel="ทุกประเภท"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🧾 ใบเสร็จ</label>
            <SearchableSelect
              value={filterReceipt}
              onChange={(val) => setFilterReceipt(val)}
              className="app-select"
              options={[
                { value: "missing", label: "ยังไม่มีใบเสร็จ" },
                { value: "has", label: "มีใบเสร็จแล้ว" },
              ]}
              emptyLabel="ทั้งหมด"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>⏰ Due ตั้งแต่</label>
            <input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="app-input" />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>⏰ Due ถึง</label>
            <input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="app-input" />
          </div>
        </div>
      </div>

      {/* Table */}
      {paymentsQuery.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🧾</div>
            <p className="app-empty-title">
              {payments.length === 0 ? "ยังไม่มีรายการค่าใช้จ่าย" : "ไม่พบรายการที่ค้นหา"}
            </p>
            <p className="app-empty-desc">
              {payments.length === 0
                ? "เริ่มบันทึกค่าใช้จ่ายแรก หรือตั้งเบิกจากหน้าตั้งเบิก"
                : "ลองเปลี่ยนตัวกรอง"}
            </p>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>รายละเอียด</th>
                <th>โปรเจกต์</th>
                <th>ผู้รับเงิน</th>
                <th>ประเภท</th>
                <th className="text-right">ยอดชำระ</th>
                <th>สถานะ</th>
                <th>ใบเสร็จ</th>
                <th>เอกสาร</th>
                <th>Due Date</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const s = STATUS_LABEL[p.status] || STATUS_LABEL.pending;
                const t = TYPE_LABEL[p.expenseType] || TYPE_LABEL.account;
                const hasReceipt = !!p.receiptUrl;
                const hasDocumentation = p.documentType === "id_card" || p.documentType === "substitute_receipt";
                const canAttachReceipt = p.status === "approved" || p.status === "paid" || p.status === "cleared";
                return (
                  <tr key={p.paymentId}>
                    <td>
                      <div
                        style={{ fontWeight: 500, cursor: "pointer", color: "#2563eb" }}
                        onClick={() => setViewPaymentId(p.paymentId)}
                        title="คลิกเพื่อดูรายละเอียด"
                      >
                        {p.description} 👁
                      </div>
                      {p.categoryMain && (
                        <div style={{ fontSize: "0.65rem", color: "#78716c" }}>
                          {p.documentType === "tax_invoice" ? "📋" : p.documentType === "receipt" ? "🧾" : ""}
                          {` ${p.categoryMain}`}
                          {p.categorySub ? ` > ${p.categorySub}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>{eventMap[p.eventId] || "-"}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{payeeMap[p.payeeId] || "-"}</td>
                    <td>
                      <span className={`app-badge ${t.cls}`}>{t.icon} {t.label}</span>
                    </td>
                    <td className="text-right num" style={{ fontWeight: 600 }}>
                      ฿{formatNumber(p.gttlAmount)}
                    </td>
                    <td>
                      <span className={`app-badge ${s.cls}`}>{s.label}</span>
                    </td>
                    {/* ใบเสร็จ — "แนบแล้ว" = มีไฟล์จริง upload ไว้ใน Drive เท่านั้น */}
                    <td className="text-center">
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="app-btn app-btn-ghost app-btn-sm"
                          title={`คลิกเพื่อดูไฟล์ที่แนบไว้\n${p.receiptUrl}`}
                          style={{ color: "#16a34a", fontSize: "0.75rem" }}
                        >
                          ✅ แนบแล้ว
                        </a>
                      ) : p.invoiceFileUrl ? (
                        <a
                          href={p.invoiceFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="app-btn app-btn-ghost app-btn-sm"
                          title={`คลิกเพื่อดูไฟล์ที่แนบไว้\n${p.invoiceFileUrl}`}
                          style={{ color: "#16a34a", fontSize: "0.75rem" }}
                        >
                          ✅ แนบแล้ว
                        </a>
                      ) : canAttachReceipt ? (
                        <button
                          className="app-btn app-btn-ghost app-btn-sm"
                          style={{ color: "#dc2626", fontSize: "0.75rem" }}
                          onClick={() => setAttachChoiceId(p.paymentId)}
                          title="ยังไม่มีไฟล์แนบ — คลิกเพื่อแนบใบเสร็จ/สำเนาบัตร"
                        >
                          📎 แนบ
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    {/* เอกสาร — ระบบออกให้อัตโนมัติ (ไม่ซ้ำซ้อน)
                        Rule:
                          - WTH > 0 → WHT cert (หัก ณ ที่จ่าย)
                          - documentType = substitute_receipt → ใบรับรองแทนใบเสร็จ
                          - documentType = id_card + WTH = 0 → ใบสำคัญรับเงิน
                          - ถ้ามี WTH + documentType → แสดง WHT cert เท่านั้น (ไม่ออกใบสำคัญ/ใบรับรองแทน) */}
                    <td className="text-center">
                      {(() => {
                        const canGen = p.status === "paid" || p.status === "approved" || p.status === "cleared";
                        if (!canGen) return <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>—</span>;

                        const hasWth = p.wthAmount > 0;
                        // ถ้ามี WTH → ออก WHT cert อย่างเดียว
                        if (hasWth) {
                          return (
                            <a href={`/documents/wht-cert/${p.paymentId}`} target="_blank" rel="noopener noreferrer"
                              className="app-btn app-btn-ghost app-btn-sm" title="ใบหัก ณ ที่จ่าย"
                              style={{ color: "#7c3aed", fontSize: "0.7rem" }}>
                              📄 หัก ณ ที่จ่าย
                            </a>
                          );
                        }
                        // ไม่มี WTH → ดูตาม documentType
                        if (p.documentType === "substitute_receipt") {
                          return (
                            <a href={`/documents/substitute-receipt/${p.paymentId}`} target="_blank" rel="noopener noreferrer"
                              className="app-btn app-btn-ghost app-btn-sm" title="ใบรับรองแทนใบเสร็จ"
                              style={{ color: "#d97706", fontSize: "0.7rem" }}>
                              🧾 ใบรับรองแทน
                            </a>
                          );
                        }
                        if (p.documentType === "id_card") {
                          return (
                            <a href={`/documents/receipt-voucher/${p.paymentId}`} target="_blank" rel="noopener noreferrer"
                              className="app-btn app-btn-ghost app-btn-sm" title="ใบสำคัญรับเงิน"
                              style={{ color: "#059669", fontSize: "0.7rem" }}>
                              🧾 ใบสำคัญรับเงิน
                            </a>
                          );
                        }
                        return <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>—</span>;
                      })()}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {formatDate(p.dueDate)}
                    </td>
                    <td className="text-center">
                      <button
                        className="app-btn app-btn-ghost app-btn-sm"
                        onClick={() => setViewPaymentId(p.paymentId)}
                        title="ดูรายละเอียด"
                      >
                        👁
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual create modal (ใบเสร็จ 3-tab format) */}
      {showManual && (
        <ManualReceiptModal
          events={events}
          payees={payees}
          onClose={() => setShowManual(false)}
          onSuccess={() => {
            setShowManual(false);
            refreshAll();
          }}
        />
      )}

      {/* Upload receipt modal (ใบเสร็จ/ใบกำกับภาษี) */}
      {showUpload && (
        <UploadReceiptModal
          events={events}
          payees={payees}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            refreshAll();
          }}
        />
      )}

      {/* Attach choice dialog — มีใบเสร็จ / ไม่มีใบเสร็จ */}
      {attachChoiceId && (
        <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAttachChoiceId(null)}>
          <div className="app-modal" style={{ maxWidth: "380px", padding: "1.5rem" }}>
            <h3 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "1rem", textAlign: "center" }}>📎 แนบเอกสาร</h3>
            <p style={{ fontSize: "0.875rem", color: "#475569", marginBottom: "1.25rem", textAlign: "center" }}>เลือกรูปแบบการแนบเอกสาร</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <button
                className="app-btn app-btn-primary"
                style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
                onClick={() => { setAttachPaymentId(attachChoiceId); setAttachMode("upload"); setAttachChoiceId(null); }}
              >
                🧾 มีใบเสร็จ / ใบกำกับภาษี
              </button>
              <button
                className="app-btn app-btn-secondary"
                style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
                onClick={() => { setAttachPaymentId(attachChoiceId); setAttachMode("manual"); setAttachChoiceId(null); }}
              >
                📝 ไม่มีใบเสร็จ
              </button>
            </div>
            <button className="app-btn app-btn-ghost" style={{ width: "100%", marginTop: "0.75rem" }} onClick={() => setAttachChoiceId(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Attach receipt to existing payment — Upload mode */}
      {attachPaymentId && attachMode === "upload" && (() => {
        const ap = payments.find((p) => p.paymentId === attachPaymentId);
        return ap ? (
          <UploadReceiptModal
            events={events}
            payees={payees}
            attachToPayment={ap}
            onClose={() => { setAttachPaymentId(null); setAttachMode(null); }}
            onSuccess={() => {
              setAttachPaymentId(null);
              setAttachMode(null);
              refreshAll();
            }}
          />
        ) : null;
      })()}

      {/* Attach receipt to existing payment — Manual mode (ไม่มีใบเสร็จ) */}
      {attachPaymentId && attachMode === "manual" && (() => {
        const ap = payments.find((p) => p.paymentId === attachPaymentId);
        return ap ? (
          <ManualReceiptModal
            events={events}
            payees={payees}
            attachToPayment={ap}
            onClose={() => { setAttachPaymentId(null); setAttachMode(null); }}
            onSuccess={() => {
              setAttachPaymentId(null);
              setAttachMode(null);
              refreshAll();
            }}
          />
        ) : null;
      })()}

      {/* View detail modal */}
      {viewPaymentId && viewPayment && (
        <PaymentModal
          payment={viewPayment}
          events={events}
          payees={payees}
          onClose={() => setViewPaymentId(null)}
          onSuccess={() => {
            setViewPaymentId(null);
            refreshAll();
          }}
        />
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
