"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect from "@/components/searchable-select";

type DocTab = "need_receipt" | "need_clear" | "completed";

const TAB_LABELS: Record<DocTab, { label: string; icon: string }> = {
  need_receipt: { label: "รอใบเสร็จ", icon: "📋" },
  need_clear: { label: "รอเคลียร์", icon: "💵" },
  completed: { label: "ครบแล้ว", icon: "✅" },
};

export default function DocumentsPage() {
  const paymentsQuery = trpc.payment.list.useQuery();
  const eventsQuery = trpc.event.list.useQuery();
  const payeesQuery = trpc.payee.list.useQuery();

  const payments = paymentsQuery.data || [];
  const events = eventsQuery.data || [];
  const payees = payeesQuery.data || [];

  const eventMap = useMemo(
    () => Object.fromEntries(events.map((e) => [e.eventId, e.eventName])),
    [events]
  );
  const payeeMap = useMemo(
    () => Object.fromEntries(payees.map((p) => [p.payeeId, p.payeeName])),
    [payees]
  );

  const [tab, setTab] = useState<DocTab>("need_receipt");
  const [filterEventId, setFilterEventId] = useState("all");
  const [search, setSearch] = useState("");

  // === Categorize payments ===
  const needReceipt = payments.filter(
    (p) =>
      (p.status === "paid" || p.status === "approved") &&
      !p.receiptUrl &&
      !p.isCleared
  );

  const needClear = payments.filter(
    (p) =>
      p.expenseType === "team" &&
      p.status === "paid" &&
      !p.isCleared
  );

  const completed = payments.filter(
    (p) =>
      (p.receiptUrl && (p.status === "paid" || p.status === "cleared")) ||
      p.isCleared
  );

  const lists: Record<DocTab, typeof payments> = {
    need_receipt: needReceipt,
    need_clear: needClear,
    completed,
  };

  // === Filters ===
  const currentList = lists[tab];
  const filtered = currentList.filter((p) => {
    if (filterEventId !== "all" && p.eventId !== filterEventId) return false;
    if (search) {
      const s = search.toLowerCase();
      const desc = p.description.toLowerCase();
      const payee = (payeeMap[p.payeeId] || "").toLowerCase();
      const event = (eventMap[p.eventId] || "").toLowerCase();
      if (!desc.includes(s) && !payee.includes(s) && !event.includes(s)) return false;
    }
    return true;
  });

  const eventOptions = [
    { value: "all", label: "ทุกโปรเจกต์" },
    ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
  ];

  const isLoading = paymentsQuery.isLoading || eventsQuery.isLoading || payeesQuery.isLoading;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📄 เอกสาร / ใบเสร็จ</h1>
          <p className="app-page-subtitle">
            ติดตามสถานะเอกสาร ใบเสร็จ และเคลียร์งบ
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
        {(Object.keys(TAB_LABELS) as DocTab[]).map((key) => {
          const info = TAB_LABELS[key];
          const count = lists[key].length;
          const total = lists[key].reduce((s, p) => s + p.gttlAmount, 0);
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="app-card"
              style={{
                cursor: "pointer",
                border: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                background: isActive ? "#eff6ff" : "#ffffff",
                textAlign: "left",
                padding: "1rem",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                <span>{info.icon}</span>
                <span style={{ fontWeight: 500, fontSize: "0.875rem", color: "#475569" }}>{info.label}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.5rem", color: "#0f172a" }}>{count}</div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                รวม ฿{formatNumber(total)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="app-filter-row">
        <input
          type="text"
          placeholder="🔍 ค้นหา..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input"
          style={{ minWidth: "200px" }}
        />
        <SearchableSelect
          options={eventOptions}
          value={filterEventId}
          onChange={setFilterEventId}
          emptyLabel="ทุกโปรเจกต์"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="app-card">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="app-skeleton" style={{ height: "56px" }} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">{TAB_LABELS[tab].icon}</div>
            <p className="app-empty-title">
              {currentList.length === 0
                ? tab === "completed"
                  ? "ยังไม่มีเอกสารที่ครบแล้ว"
                  : "ไม่มีรายการค้าง"
                : "ไม่พบรายการตามตัวกรอง"
              }
            </p>
            <p className="app-empty-desc">
              {tab === "need_receipt"
                ? "รายการที่จ่ายแล้วแต่ยังไม่แนบใบเสร็จจะปรากฏที่นี่"
                : tab === "need_clear"
                ? "Team Expense ที่จ่ายสดแล้วแต่ยังไม่เคลียร์จะปรากฏที่นี่"
                : "รายการที่ดำเนินการเอกสารครบแล้วจะปรากฏที่นี่"
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>รายการ</th>
                <th>โปรเจกต์</th>
                <th>ผู้รับเงิน</th>
                <th className="text-right">ยอดจ่าย</th>
                <th>ประเภท</th>
                {tab === "need_receipt" && <th>สถานะ</th>}
                {tab === "need_clear" && <th>วันที่จ่าย</th>}
                {tab === "completed" && <th>ใบเสร็จ</th>}
                <th className="text-center">เอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.paymentId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.description}</div>
                    <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                      {p.paymentId}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>
                    {eventMap[p.eventId] || p.eventId}
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>
                    {payeeMap[p.payeeId] || p.payeeId}
                  </td>
                  <td className="text-right num">
                    ฿{formatNumber(p.gttlAmount)}
                  </td>
                  <td>
                    <span className={`app-badge ${p.expenseType === "team" ? "app-badge-warning" : "app-badge-info"}`}>
                      {p.expenseType === "team" ? "เบิกสด" : "โอนบัญชี"}
                    </span>
                  </td>

                  {/* Tab-specific columns */}
                  {tab === "need_receipt" && (
                    <td>
                      <span className="app-badge app-badge-warning">รอใบเสร็จ</span>
                    </td>
                  )}
                  {tab === "need_clear" && (
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {formatDate(p.paidAt || p.paymentDate)}
                    </td>
                  )}
                  {tab === "completed" && (
                    <td>
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#2563eb", fontSize: "0.8125rem" }}
                        >
                          {p.receiptNumber || "ดูใบเสร็จ"}
                        </a>
                      ) : p.isCleared ? (
                        <span className="app-badge app-badge-success">เคลียร์แล้ว</span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.8125rem" }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Document links */}
                  <td className="text-center" style={{ whiteSpace: "nowrap" }}>
                    {p.wthAmount > 0 && (p.status === "paid" || p.status === "approved" || p.status === "cleared") && (
                      <a
                        href={`/documents/wht-cert/${p.paymentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-btn app-btn-ghost app-btn-sm"
                        title="ใบหัก ณ ที่จ่าย"
                      >
                        📄 ภ.ง.ด.
                      </a>
                    )}
                    {!p.receiptUrl &&
                      (p.vatAmount === 0) &&
                      (p.status === "paid" || p.status === "approved" || p.status === "cleared") && (
                      <a
                        href={`/documents/substitute-receipt/${p.paymentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-btn app-btn-ghost app-btn-sm"
                        title="ใบรับรองแทนใบเสร็จ"
                      >
                        🧾 ทดแทน
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== Helpers =====

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(s: string): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return s;
  }
}
