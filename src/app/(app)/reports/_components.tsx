// ===========================================
// /reports — Internal subcomponents shared by all tabs
//
// - StatusBadge / TypeBadge — display chips
// - ProgressBar             — budget bar (used in by-project tab)
// - formatTHB / formatThaiDate — formatting helpers
// ===========================================

"use client";

export function formatTHB(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

/**
 * Format a Date as YYYY-MM-DD using LOCAL timezone (not UTC).
 *
 * Why: `date.toISOString().slice(0, 10)` converts to UTC first.
 * In ICT (UTC+7), `new Date(2026, 3, 1)` (1 Apr 2026 ICT) becomes
 * `"2026-03-31T17:00:00.000Z"` → slice gives `"2026-03-31"` ❌
 *
 * Use this helper anywhere we need a local-timezone YYYY-MM-DD string
 * for date filters, sheet queries, etc.
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatThaiDate(s: string): string {
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

export type PaymentStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "cleared";
export type ExpenseType = "team" | "account";

export const STATUS_LABEL: Record<
  PaymentStatus,
  { label: string; class: string }
> = {
  pending: { label: "รอตรวจ", class: "app-badge-warning" },
  approved: { label: "อนุมัติแล้ว", class: "app-badge-info" },
  paid: { label: "จ่ายแล้ว", class: "app-badge-success" },
  rejected: { label: "ปฏิเสธ", class: "app-badge-error" },
  cleared: { label: "เคลียร์แล้ว", class: "app-badge-success" },
};

export const TYPE_LABEL: Record<
  ExpenseType,
  { label: string; class: string; icon: string }
> = {
  team: { label: "เบิกเงินสด", class: "app-badge-warning", icon: "💵" },
  account: { label: "โอนบัญชี", class: "app-badge-info", icon: "🏦" },
};

export const PROJECT_STATUS_LABEL: Record<
  string,
  { label: string; class: string }
> = {
  active: { label: "Active", class: "app-badge-info" },
  completed: { label: "เสร็จแล้ว", class: "app-badge-success" },
  cancelled: { label: "ยกเลิก", class: "app-badge-neutral" },
  paused: { label: "พักไว้", class: "app-badge-warning" },
};

/** Fallback for unknown status values from old/dirty rows in the sheet. */
const UNKNOWN_STATUS = { label: "—", class: "app-badge-neutral" } as const;
const UNKNOWN_TYPE = {
  label: "—",
  class: "app-badge-neutral",
  icon: "❓",
} as const;

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const s = STATUS_LABEL[status] ?? UNKNOWN_STATUS;
  return <span className={`app-badge ${s.class}`}>{s.label}</span>;
}

export function TypeBadge({ type }: { type: ExpenseType }) {
  const t = TYPE_LABEL[type] ?? UNKNOWN_TYPE;
  return (
    <span className={`app-badge ${t.class}`}>
      {t.icon} {t.label}
    </span>
  );
}

/**
 * Budget progress bar.
 *  - <80%  : green
 *  - 80–100: amber
 *  - >100% : red + "เกินงบ" label
 */
export function ProgressBar({
  percentage,
  isOverBudget,
}: {
  percentage: number;
  isOverBudget: boolean;
}) {
  const pct = Math.min(100, Math.max(0, percentage));
  const color = isOverBudget
    ? "#dc2626"
    : percentage >= 80
    ? "#d97706"
    : "#16a34a";
  return (
    <div style={{ minWidth: 120 }}>
      <div
        style={{
          height: 8,
          background: "#f1f5f9",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 0.3s ease",
          }}
        />
        {isOverBudget && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: 2,
              background: "#7f1d1d",
            }}
          />
        )}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          color: isOverBudget ? "#dc2626" : "#64748b",
          marginTop: 2,
          fontWeight: isOverBudget ? 600 : 400,
        }}
      >
        {percentage.toFixed(1)}%{isOverBudget ? " ⚠ เกินงบ" : ""}
      </div>
    </div>
  );
}
