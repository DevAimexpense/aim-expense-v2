"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

const PLAN_FEATURES: Record<string, { revenue: boolean; vat: boolean; pl: boolean }> = {
  free: { revenue: false, vat: false, pl: false },
  basic: { revenue: false, vat: false, pl: false },
  pro: { revenue: true, vat: true, pl: true },
  business: { revenue: true, vat: true, pl: true },
  max: { revenue: true, vat: true, pl: true },
  enterprise: { revenue: true, vat: true, pl: true },
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free Forever",
  basic: "Basic",
  pro: "Pro",
  business: "Business",
  max: "Max",
  enterprise: "Enterprise",
};

export function DashboardClient({
  orgName,
  userName,
  plan,
}: {
  orgName: string;
  userName: string;
  plan: string;
}) {
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());

  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  // Filter logic
  const filteredEvents = useMemo(() => {
    if (filterEvent === "all") return events;
    return events.filter((e) => e.eventId === filterEvent);
  }, [events, filterEvent]);

  // Stats
  const activeEvents = events.filter((e) => e.status === "active");
  const totalBudget = filteredEvents.reduce((sum, e) => sum + e.budget, 0);
  const totalSpent = filteredEvents.reduce((sum, e) => sum + e.totalSpent, 0);
  const totalRemaining = totalBudget - totalSpent;
  const overBudgetCount = filteredEvents.filter((e) => e.isOverBudget).length;

  // Mock data for revenue/VAT (Wave 2 features)
  const totalQuotation = 0;
  const totalInvoiced = 0;
  const totalPaid = 0;
  const totalProfit = totalInvoiced - totalSpent;
  const inputVat = 0;
  const outputVat = 0;

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">สวัสดี {userName} 👋</h1>
          <p className="app-page-subtitle">
            สรุปภาพรวม {orgName} • Plan: {PLAN_LABEL[plan] || plan}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a href="/events" className="app-btn app-btn-secondary">
            📋 จัดการโปรเจกต์
          </a>
          <a href="/payments/search" className="app-btn app-btn-primary">
            ➕ บันทึกค่าใช้จ่าย
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="app-filter-row">
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกโปรเจกต์" },
            ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
          ]}
          value={filterEvent}
          onChange={(val) => setFilterEvent(val)}
          className="app-select"
          emptyLabel="ทุกโปรเจกต์"
        />
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="app-input"
        />
        {(filterEvent !== "all" || filterMonth !== currentMonth()) && (
          <button
            onClick={() => {
              setFilterEvent("all");
              setFilterMonth(currentMonth());
            }}
            className="app-btn app-btn-ghost app-btn-sm"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Stat Cards Row 1 */}
      <div className="app-stats-grid">
        <StatCard
          color="blue"
          icon="📁"
          label="โปรเจกต์ที่ Active"
          value={String(activeEvents.length)}
          sub={`${events.length} โปรเจกต์ทั้งหมด`}
        />
        <StatCard
          color="amber"
          icon="💰"
          label="งบประมาณรวม"
          value={`฿${formatNumber(totalBudget)}`}
          sub={filterEvent === "all" ? "ทุกโปรเจกต์" : "โปรเจกต์ที่เลือก"}
        />
        <StatCard
          color="rose"
          icon="📤"
          label="ใช้ไปแล้ว"
          value={`฿${formatNumber(totalSpent)}`}
          sub={overBudgetCount > 0 ? `⚠️ เกินงบ ${overBudgetCount} โปรเจกต์` : "อยู่ในงบ"}
        />
        <StatCard
          color="green"
          icon="🪙"
          label="งบคงเหลือ"
          value={`฿${formatNumber(totalRemaining)}`}
          sub={
            totalBudget > 0
              ? `${((totalRemaining / totalBudget) * 100).toFixed(0)}% ของงบ`
              : "ยังไม่มีงบประมาณ"
          }
        />
      </div>

      {/* Revenue & Profit (Pro+ only) */}
      <div className="app-card" style={{ marginBottom: "1.5rem" }}>
        <div className="app-card-header">
          <div>
            <h2 className="app-card-title">💼 รายได้ และ กำไร/ขาดทุน</h2>
            <p className="app-card-subtitle">
              เปรียบเทียบรายรับ-รายจ่ายต่อโปรเจกต์
            </p>
          </div>
          {!features.pl && (
            <span className="app-badge app-badge-info">Pro+ Feature</span>
          )}
        </div>

        {features.pl ? (
          <div className="app-stats-grid" style={{ marginBottom: 0 }}>
            <StatCard
              color="violet"
              icon="📜"
              label="ใบเสนอราคา (Quotation)"
              value={`฿${formatNumber(totalQuotation)}`}
              sub="ยอดเสนอราคาทั้งหมด"
              compact
            />
            <StatCard
              color="blue"
              icon="🧾"
              label="ใบวางบิล (Invoiced)"
              value={`฿${formatNumber(totalInvoiced)}`}
              sub="ยอดที่ออกบิลแล้ว"
              compact
            />
            <StatCard
              color="rose"
              icon="📤"
              label="ค่าใช้จ่าย"
              value={`฿${formatNumber(totalSpent)}`}
              sub="รายจ่ายทั้งหมด"
              compact
            />
            <StatCard
              color={totalProfit >= 0 ? "green" : "rose"}
              icon={totalProfit >= 0 ? "📈" : "📉"}
              label={totalProfit >= 0 ? "กำไร" : "ขาดทุน"}
              value={`฿${formatNumber(Math.abs(totalProfit))}`}
              sub={totalInvoiced > 0
                ? `Margin ${((totalProfit / totalInvoiced) * 100).toFixed(1)}%`
                : "ยังไม่มีรายได้"}
              compact
            />
          </div>
        ) : (
          <div className="app-locked">
            <div className="app-locked-icon">🔒</div>
            <p className="app-locked-title">เปิดใช้งาน Profit Tracking</p>
            <p className="app-locked-desc">
              ติดตามรายได้ ค่าใช้จ่าย และกำไรต่อโปรเจกต์ — เริ่มต้นที่ Pro plan
            </p>
            <a href="/settings/billing" className="app-btn app-btn-primary app-btn-sm">
              อัปเกรดแพ็คเกจ
            </a>
          </div>
        )}
      </div>

      {/* VAT Summary (Pro+ only) */}
      <div className="app-section cols-2">
        <div className="app-card">
          <div className="app-card-header">
            <div>
              <h2 className="app-card-title">📊 ภาษีซื้อ-ขาย (เดือนนี้)</h2>
              <p className="app-card-subtitle">สำหรับยื่น ภ.พ.30</p>
            </div>
            {!features.vat && (
              <span className="app-badge app-badge-info">Pro+ Feature</span>
            )}
          </div>

          {features.vat ? (
            <div style={{ display: "grid", gap: "0.875rem" }}>
              <VatRow label="ภาษีซื้อ (Input VAT)" value={inputVat} color="blue" />
              <VatRow label="ภาษีขาย (Output VAT)" value={outputVat} color="amber" />
              <div
                style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "0.875rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600, color: "#0f172a" }}>
                  ยอดสุทธิ {outputVat - inputVat >= 0 ? "ต้องชำระ" : "ขอคืน"}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "1.125rem",
                    color: outputVat - inputVat >= 0 ? "#dc2626" : "#16a34a",
                  }}
                >
                  ฿{formatNumber(Math.abs(outputVat - inputVat))}
                </span>
              </div>
            </div>
          ) : (
            <div className="app-locked">
              <div className="app-locked-icon">📊</div>
              <p className="app-locked-title">VAT Report</p>
              <p className="app-locked-desc">
                สรุปภาษีซื้อ-ขาย พร้อมดาวน์โหลด ภ.พ.30 — เริ่มต้นที่ Pro plan
              </p>
            </div>
          )}
        </div>

        {/* Top events by budget usage */}
        <div className="app-card">
          <div className="app-card-header">
            <div>
              <h2 className="app-card-title">🏆 โปรเจกต์ใช้งบสูงสุด</h2>
              <p className="app-card-subtitle">เรียงตาม % การใช้งบ</p>
            </div>
            <a href="/events" className="app-btn app-btn-ghost app-btn-sm">
              ดูทั้งหมด →
            </a>
          </div>

          {events.length === 0 ? (
            <div className="app-empty">
              <div className="app-empty-icon">📋</div>
              <p className="app-empty-title">ยังไม่มีโปรเจกต์</p>
              <p className="app-empty-desc">
                เริ่มจากสร้างโปรเจกต์แรกของคุณ
              </p>
              <a href="/events" className="app-btn app-btn-primary">
                + สร้างโปรเจกต์
              </a>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.875rem" }}>
              {[...events]
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 5)
                .map((event) => (
                  <EventBudgetItem key={event.eventId} event={event} />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-event detail table */}
      <div className="app-card" style={{ marginBottom: "1.5rem" }}>
        <div className="app-card-header">
          <div>
            <h2 className="app-card-title">📋 รายละเอียดแยกโปรเจกต์</h2>
            <p className="app-card-subtitle">เปรียบเทียบงบประมาณ vs รายจ่ายจริง</p>
          </div>
          <a href="/events" className="app-btn app-btn-ghost app-btn-sm">
            จัดการโปรเจกต์ →
          </a>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="app-empty">
            <div className="app-empty-icon">📁</div>
            <p className="app-empty-title">ไม่มีโปรเจกต์</p>
          </div>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>โปรเจกต์</th>
                  <th className="text-right">งบประมาณ</th>
                  <th className="text-right">ใช้ไป</th>
                  <th className="text-right">คงเหลือ</th>
                  <th>การใช้งบ</th>
                  <th className="text-center">สถานะ</th>
                  <th className="text-center">รายการ</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredEvents]
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((ev) => {
                    const fillClass =
                      ev.percentage >= 100
                        ? "danger"
                        : ev.percentage >= 80
                        ? "warning"
                        : "";
                    const statusBadge =
                      ev.status === "completed"
                        ? { label: "เสร็จสิ้น", cls: "app-badge-info" }
                        : ev.status === "cancelled"
                        ? { label: "ยกเลิก", cls: "app-badge-neutral" }
                        : ev.isOverBudget
                        ? { label: "เกินงบ", cls: "app-badge-error" }
                        : ev.percentage >= 80
                        ? { label: "ใกล้เต็ม", cls: "app-badge-warning" }
                        : { label: "ในงบ", cls: "app-badge-success" };
                    return (
                      <tr key={ev.eventId}>
                        <td>
                          <a
                            href={`/events`}
                            style={{
                              color: "#0f172a",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {ev.eventName}
                          </a>
                        </td>
                        <td className="text-right num">
                          ฿{formatNumber(ev.budget)}
                        </td>
                        <td
                          className="text-right num"
                          style={{
                            color: ev.isOverBudget ? "#dc2626" : "#0f172a",
                          }}
                        >
                          ฿{formatNumber(ev.totalSpent)}
                        </td>
                        <td
                          className="text-right num"
                          style={{
                            color: ev.remaining < 0 ? "#dc2626" : "#16a34a",
                            fontWeight: 500,
                          }}
                        >
                          ฿{formatNumber(ev.remaining)}
                        </td>
                        <td style={{ minWidth: "140px" }}>
                          <div className="budget-bar-wrap">
                            <div
                              className={`budget-bar-fill ${fillClass}`}
                              style={{ width: `${Math.min(ev.percentage, 100)}%` }}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: "0.6875rem",
                              color: "#64748b",
                              marginTop: "0.25rem",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {ev.percentage.toFixed(1)}%
                          </div>
                        </td>
                        <td className="text-center">
                          <span className={`app-badge ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="text-center num">{ev.paymentCount}</td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
                  <td>รวม {filteredEvents.length} โปรเจกต์</td>
                  <td className="text-right num">฿{formatNumber(totalBudget)}</td>
                  <td className="text-right num" style={{ color: "#dc2626" }}>
                    ฿{formatNumber(totalSpent)}
                  </td>
                  <td
                    className="text-right num"
                    style={{ color: totalRemaining < 0 ? "#dc2626" : "#16a34a" }}
                  >
                    ฿{formatNumber(totalRemaining)}
                  </td>
                  <td colSpan={3} style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {totalBudget > 0
                      ? `ใช้ไปแล้ว ${((totalSpent / totalBudget) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p
        style={{
          marginTop: "1.5rem",
          fontSize: "0.75rem",
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        💡 รายได้ + ภาษี + ใบเสนอราคา จะเปิดใช้งานเต็มรูปแบบใน Wave 2
      </p>
    </div>
  );
}

// ===== Components =====

function StatCard({
  color,
  icon,
  label,
  value,
  sub,
  compact = false,
}: {
  color: "blue" | "green" | "amber" | "rose" | "violet";
  icon: string;
  label: string;
  value: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className={`app-stat-card gradient-${color}`}>
      <div className={`app-stat-icon ${color}`}>{icon}</div>
      <p className="app-stat-label">{label}</p>
      <p className={compact ? "app-stat-value-sm" : "app-stat-value"}>{value}</p>
      {sub && <p className="app-stat-sub">{sub}</p>}
    </div>
  );
}

function VatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "amber";
}) {
  const bgMap = { blue: "#dbeafe", amber: "#fef3c7" };
  const textMap = { blue: "#1e40af", amber: "#854d0e" };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <span
          style={{
            width: "0.5rem",
            height: "0.5rem",
            borderRadius: "9999px",
            background: textMap[color],
          }}
        />
        <span style={{ fontSize: "0.875rem", color: "#475569" }}>{label}</span>
      </div>
      <span
        style={{
          fontWeight: 600,
          color: textMap[color],
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ฿{formatNumber(value)}
      </span>
    </div>
  );
}

function EventBudgetItem({
  event,
}: {
  event: {
    eventId: string;
    eventName: string;
    budget: number;
    totalSpent: number;
    percentage: number;
    isOverBudget: boolean;
  };
}) {
  const pct = Math.min(event.percentage, 100);
  const fillClass =
    event.percentage >= 100
      ? "danger"
      : event.percentage >= 80
      ? "warning"
      : "";
  return (
    <a
      href={`/events/${event.eventId}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#0f172a" }}>
          {event.eventName}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color: event.isOverBudget ? "#dc2626" : "#64748b",
            fontWeight: 500,
          }}
        >
          ฿{formatNumber(event.totalSpent)} / ฿{formatNumber(event.budget)}
        </span>
      </div>
      <div className="budget-bar-wrap">
        <div
          className={`budget-bar-fill ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        style={{
          fontSize: "0.6875rem",
          color: "#94a3b8",
          marginTop: "0.25rem",
          textAlign: "right",
        }}
      >
        {event.percentage.toFixed(1)}%
      </div>
    </a>
  );
}

// ===== Helpers =====

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
