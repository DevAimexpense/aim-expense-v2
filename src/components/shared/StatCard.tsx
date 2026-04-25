/**
 * StatCard — KPI tile for dashboards & reports
 *
 * Re-uses existing `.app-stat-card` CSS tokens from src/app/globals.css
 * (no new CSS required; extends current design system).
 *
 * @example
 *   <StatCard color="blue" icon="💰" label="งบประมาณรวม" value="฿1,234,567" />
 *   <StatCard color="green" label="ยอดคงเหลือ" value="฿100,000"
 *             trend={{ direction: "up", value: "+12%", label: "vs เดือนก่อน" }} />
 */

import type { ReactNode } from "react";

export type StatCardColor =
  | "blue"
  | "green"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

export interface StatCardTrend {
  direction: "up" | "down" | "neutral";
  /** Display string e.g. "+12%" or "-฿1,200" */
  value: string;
  /** Sub-label e.g. "vs เดือนก่อน" (optional) */
  label?: string;
  /**
   * Override semantic intent.
   * Default: up=positive (green), down=negative (rose), neutral=slate.
   * Pass `intent: "negative"` on an "up" trend when more = bad (e.g. expenses).
   */
  intent?: "positive" | "negative" | "neutral";
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Sub-line under the value */
  sub?: ReactNode;
  /** Emoji or single character; renders inside colored chip */
  icon?: ReactNode;
  color?: StatCardColor;
  /** Smaller value typography (1.25rem vs 1.875rem) */
  compact?: boolean;
  trend?: StatCardTrend;
  /** Optional href — wraps the card in an <a> for navigation */
  href?: string;
  /** Custom class hook */
  className?: string;
}

const TREND_GLYPH: Record<StatCardTrend["direction"], string> = {
  up: "▲",
  down: "▼",
  neutral: "•",
};

function resolveTrendColor(t: StatCardTrend): string {
  const intent =
    t.intent ??
    (t.direction === "up"
      ? "positive"
      : t.direction === "down"
      ? "negative"
      : "neutral");

  if (intent === "positive") return "#16a34a"; // green-600
  if (intent === "negative") return "#dc2626"; // red-600
  return "#64748b"; // slate-500
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = "blue",
  compact = false,
  trend,
  href,
  className,
}: StatCardProps) {
  const cardClass = [
    "app-stat-card",
    `gradient-${color}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon !== undefined && (
        <div className={`app-stat-icon ${color}`}>{icon}</div>
      )}
      <p className="app-stat-label">{label}</p>
      <p className={compact ? "app-stat-value-sm" : "app-stat-value"}>
        {value}
      </p>
      {sub && <p className="app-stat-sub">{sub}</p>}
      {trend && (
        <p
          style={{
            margin: "0.5rem 0 0 0",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: resolveTrendColor(trend),
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <span aria-hidden="true">{TREND_GLYPH[trend.direction]}</span>
          <span>{trend.value}</span>
          {trend.label && (
            <span style={{ color: "#94a3b8", fontWeight: 400 }}>
              {trend.label}
            </span>
          )}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cardClass}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        {inner}
      </a>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

export default StatCard;
