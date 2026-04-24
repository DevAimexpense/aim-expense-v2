"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import { PaymentModal } from "./payment-modal";

import { UploadInvoiceModal } from "./upload-invoice-modal";

const STATUS_LABEL: Record<string, { label: string; class: string }> = {
  pending: { label: "รอตรวจ", class: "app-badge-warning" },
  approved: { label: "อนุมัติแล้ว", class: "app-badge-info" },
  paid: { label: "จ่ายแล้ว", class: "app-badge-success" },
  rejected: { label: "ปฏิเสธ", class: "app-badge-error" },
  cleared: { label: "เคลียร์แล้ว", class: "app-badge-success" },
};

const TYPE_LABEL: Record<string, { label: string; class: string; icon: string }> = {
  team: { label: "เบิกเงินสด", class: "app-badge-warning", icon: "💵" },
  account: { label: "โอนบัญชี", class: "app-badge-info", icon: "🏦" },
};

export default function PaymentsPage() {
  const utils = trpc.useUtils();
  const paymentsQuery = trpc.payment.list.useQuery();
  const eventsQuery = trpc.event.list.useQuery();
  const payeesQuery = trpc.payee.list.useQuery();
  const meQuery = trpc.org.me.useQuery();
  const canEditAfterApproval =
    meQuery.data?.permissions?.editPaymentAfterApproval ?? false;
  const myUserId = meQuery.data?.userId || "";
  const myRole = meQuery.data?.role || "";
  const isAdminOrManager = myRole === "admin" || myRole === "manager";

  const payments = paymentsQuery.data || [];
  const events = eventsQuery.data || [];
  const payees = payeesQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const eventMap = useMemo(
    () => Object.fromEntries(events.map((e) => [e.eventId, e.eventName])),
    [events]
  );
  const payeeMap = useMemo(
    () => Object.fromEntries(payees.map((p) => [p.payeeId, p.payeeName])),
    [payees]
  );

  const filtered = payments
    .filter((p) => {
      if (filterEvent !== "all" && p.eventId !== filterEvent) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterType !== "all" && p.expenseType !== filterType) return false;
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
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const totalGttl = filtered.reduce((sum, p) => sum + p.gttlAmount, 0);

  const editingPayment = payments.find((p) => p.paymentId === editingId);

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">💸 ตั้งเบิก</h1>
          <p className="app-page-subtitle">
            สร้างรายการเบิกเงิน คำนวณ และติดตามสถานะการอนุมัติ
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {pendingCount > 0 && (
            <a href="/approvals" className="app-btn app-btn-secondary">
              ⏳ รออนุมัติ ({pendingCount})
            </a>
          )}
          <button
            className="app-btn app-btn-secondary"
            onClick={() => {
              setEditingId(null);
              setShowModal(true);
            }}
            title="กรอกรายการเบิกเงินเองโดยไม่ใช้ OCR"
          >
            ✏️ ตั้งเบิก Manual
          </button>
          <button
            className="app-btn app-btn-primary"
            onClick={() => setShowUploadModal(true)}
            title="อัปโหลดใบแจ้งหนี้/ใบเสนอราคา → ระบบอ่านข้อมูลให้อัตโนมัติ"
          >
            📤 ตั้งเบิก Upload
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="app-stats-grid">
        <div className="app-stat-card gradient-blue">
          <div className="app-stat-icon blue">📋</div>
          <p className="app-stat-label">ทั้งหมด</p>
          <p className="app-stat-value-sm">{filtered.length}</p>
          <p className="app-stat-sub">รายการที่แสดง</p>
        </div>
        <div className="app-stat-card gradient-amber">
          <div className="app-stat-icon amber">⏳</div>
          <p className="app-stat-label">รอตรวจ</p>
          <p className="app-stat-value-sm">{pendingCount}</p>
          <p className="app-stat-sub">ต้องอนุมัติ</p>
        </div>
        <div className="app-stat-card gradient-green">
          <div className="app-stat-icon green">✅</div>
          <p className="app-stat-label">ที่จ่ายแล้ว</p>
          <p className="app-stat-value-sm">
            {payments.filter((p) => p.status === "paid").length}
          </p>
          <p className="app-stat-sub">รายการ</p>
        </div>
        <div className="app-stat-card gradient-rose">
          <div className="app-stat-icon rose">💵</div>
          <p className="app-stat-label">ยอดรวม (ที่แสดง)</p>
          <p className="app-stat-value-sm">฿{formatNumber(totalGttl)}</p>
          <p className="app-stat-sub">ยอดชำระสุทธิ</p>
        </div>
      </div>

      {/* Filters */}
      <div className="app-filter-row">
        <input
          type="text"
          placeholder="🔍 ค้นหา รายละเอียด / ผู้รับเงิน / โปรเจกต์..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input"
          style={{ minWidth: "260px" }}
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกโปรเจกต์" },
            ...events.map((e) => ({
              value: e.eventId,
              label: e.eventName,
            })),
          ]}
          value={filterEvent}
          onChange={(val) => setFilterEvent(val)}
          className="app-select"
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกสถานะ" },
            { value: "pending", label: "รอตรวจ" },
            { value: "approved", label: "อนุมัติแล้ว" },
            { value: "paid", label: "จ่ายแล้ว" },
            { value: "rejected", label: "ปฏิเสธ" },
            { value: "cleared", label: "เคลียร์แล้ว" },
          ]}
          value={filterStatus}
          onChange={(val) => setFilterStatus(val)}
          className="app-select"
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกประเภท" },
            { value: "team", label: "เบิกเงินสด" },
            { value: "account", label: "โอนบัญชี" },
          ]}
          value={filterType}
          onChange={(val) => setFilterType(val)}
          className="app-select"
        />
      </div>

      {/* Table */}
      {paymentsQuery.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">💰</div>
            <p className="app-empty-title">
              {payments.length === 0
                ? "ยังไม่มีรายการจ่าย"
                : "ไม่พบรายการที่ค้นหา"}
            </p>
            <p className="app-empty-desc">
              {payments.length === 0
                ? "เริ่มตั้งเบิกรายการแรก"
                : "ลองเปลี่ยนตัวกรอง"}
            </p>
            {payments.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="app-btn app-btn-primary"
              >
                + สร้างรายการแรก
              </button>
            )}
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
                return (
                  <tr key={p.paymentId}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.description}</div>
                      {p.pctWTH > 0 && (
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                          WTH {p.pctWTH}% = ฿{formatNumber(p.wthAmount)}
                          {p.vatAmount > 0
                            ? ` • VAT ฿${formatNumber(p.vatAmount)}`
                            : ""}
                        </div>
                      )}
                      {/* R6: category + docType badge */}
                      {(("categoryMain" in p && p.categoryMain) || ("documentType" in p && p.documentType)) && (
                        <div style={{ fontSize: "0.65rem", color: "#78716c", marginTop: "0.125rem" }}>
                          {p.documentType === "tax_invoice" ? "📋" : p.documentType === "receipt" ? "🧾" : ""}
                          {p.categoryMain ? ` ${p.categoryMain}` : ""}
                          {p.categorySub ? ` > ${p.categorySub}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {eventMap[p.eventId] || p.eventId}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {payeeMap[p.payeeId] || p.payeeId}
                    </td>
                    <td>
                      <span className={`app-badge ${t.class}`}>
                        {t.icon} {t.label}
                      </span>
                    </td>
                    <td className="text-right num" style={{ fontWeight: 600 }}>
                      ฿{formatNumber(p.gttlAmount)}
                    </td>
                    <td>
                      <span className={`app-badge ${s.class}`}>{s.label}</span>
                    </td>
                    {/* ใบเสร็จ — ไฟล์จริงที่ upload (receiptUrl / invoiceFileUrl) */}
                    <td className="text-center">
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="app-btn app-btn-ghost app-btn-sm"
                          title="คลิกเพื่อดูใบเสร็จ/สำเนาบัตรที่แนบไว้"
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
                          title="คลิกเพื่อดูใบแจ้งหนี้/ใบเสนอราคาที่แนบไว้"
                          style={{ color: "#2563eb", fontSize: "0.75rem" }}
                        >
                          📄 แนบแล้ว
                        </a>
                      ) : (
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    {/* เอกสาร — ใบหัก ณ ที่จ่าย / ใบรับรองแทนใบเสร็จ (ระบบออกให้) */}
                    <td className="text-center">
                      {(() => {
                        const canGen = p.status === "paid" || p.status === "approved" || p.status === "cleared";
                        const showWht = canGen && p.wthAmount > 0;
                        const showSub = canGen && (
                          p.documentType === "substitute_receipt" || p.documentType === "id_card" ||
                          (!p.receiptUrl && !p.invoiceFileUrl && p.vatAmount === 0)
                        );
                        if (!showWht && !showSub) return <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>—</span>;
                        return (
                          <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center", flexWrap: "wrap" }}>
                            {showWht && (
                              <a href={`/documents/wht-cert/${p.paymentId}`} target="_blank" rel="noopener noreferrer"
                                className="app-btn app-btn-ghost app-btn-sm" title="ใบหัก ณ ที่จ่าย"
                                style={{ color: "#7c3aed", fontSize: "0.7rem" }}>
                                📄 หัก ณ ที่จ่าย
                              </a>
                            )}
                            {showSub && (
                              <a href={`/documents/substitute-receipt/${p.paymentId}`} target="_blank" rel="noopener noreferrer"
                                className="app-btn app-btn-ghost app-btn-sm" title="ใบรับรองแทนใบเสร็จ"
                                style={{ color: "#d97706", fontSize: "0.7rem" }}>
                                🧾 ใบรับรองแทน
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {formatDate(p.dueDate)}
                    </td>
                    <td className="text-center">
                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center", flexWrap: "wrap" }}>
                        {(() => {
                          const isPending = p.status === "pending" || p.status === "rejected";
                          const isOwner = !!p.createdByUserId && p.createdByUserId === myUserId;
                          const hasOwnershipPermission = isAdminOrManager || isOwner;
                          const canEdit = (isPending || canEditAfterApproval) && hasOwnershipPermission;
                          return (
                            <button
                              className="app-btn app-btn-ghost app-btn-sm"
                              onClick={() => {
                                setEditingId(p.paymentId);
                                setShowModal(true);
                              }}
                              title={canEdit ? "แก้ไข" : "ดู"}
                            >
                              {canEdit ? "✏️" : "👁"}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PaymentModal
          payment={editingPayment}
          events={events}
          payees={payees}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingId(null);
            utils.payment.list.invalidate();
            utils.event.list.invalidate();
          }}
        />
      )}
      {showUploadModal && (
        <UploadInvoiceModal
          events={events}
          payees={payees}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            utils.payment.list.invalidate();
            utils.event.list.invalidate();
            utils.payee.list.invalidate();
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
