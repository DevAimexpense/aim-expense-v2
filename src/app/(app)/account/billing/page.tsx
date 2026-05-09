// ===========================================
// /account/billing — current plan + usage bars + upgrade CTA
// Uses project's standard app-page / app-card / brand color palette.
// ===========================================

import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_PRICING_THB,
  effectivePlan,
  isInTrial,
  type SubscriptionState,
} from "@/lib/plans";
import { getUsage } from "@/server/lib/usage";
import { COMPANY_NAME } from "@/lib/legal/version";

export const metadata: Metadata = {
  title: `แพ็คเกจของคุณ · ${COMPANY_NAME}`,
};

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

function formatLimit(n: number): string {
  if (n === -1) return "ไม่จำกัด";
  if (n === -2) return "—";
  return n.toLocaleString("th-TH");
}

function daysFromNow(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000));
}

const PLAN_ICON: Record<string, string> = {
  free: "🌱",
  basic: "🚀",
  pro: "⭐",
  business: "💼",
  max: "👑",
  enterprise: "🏢",
};

export default async function AccountBillingPage() {
  const session = await getSession();
  if (!session?.activeOrgId) redirect("/");

  const sub = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: {
      plan: true,
      trialPlan: true,
      trialStartedAt: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      billingInterval: true,
      stripeSubscriptionId: true,
    },
  });

  const plan = effectivePlan(sub as SubscriptionState | null);
  const inTrial = isInTrial(sub as SubscriptionState | null);
  const limits = PLAN_LIMITS[plan];
  const price = PLAN_PRICING_THB[plan];

  const ocrUsed = await getUsage(session.activeOrgId, "ocr");
  const memberCount = await prisma.orgMember.count({
    where: { orgId: session.activeOrgId },
  });

  const trialDaysLeft = inTrial ? daysFromNow(sub?.trialEndsAt) : 0;
  const trialPctUsed = inTrial
    ? Math.min(100, ((30 - trialDaysLeft) / 30) * 100)
    : 0;
  const isOnPaidPlan =
    !!sub?.stripeSubscriptionId && sub.plan !== "free" && !inTrial;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">💳 แพ็คเกจของคุณ</h1>
          <p className="app-page-subtitle">
            ดูแผนปัจจุบัน + การใช้งาน + อัปเกรด
          </p>
        </div>
      </div>

      {/* Hero plan card — soft brand colors */}
      <div className="app-card" style={{ marginBottom: "1rem", overflow: "hidden" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand-50) 0%, var(--color-brand-100) 100%)",
            margin: "-1rem -1rem 1rem -1rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-brand-200)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 60%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "var(--color-brand-700)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.5rem",
                }}
              >
                <span>แพ็คเกจปัจจุบัน</span>
                {inTrial && (
                  <span
                    style={{
                      background: "var(--color-accent-100)",
                      color: "var(--color-accent-800)",
                      padding: "0.125rem 0.5rem",
                      borderRadius: "999px",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.04em",
                    }}
                  >
                    🎁 Free Trial
                  </span>
                )}
                {sub?.cancelAtPeriodEnd && (
                  <span
                    style={{
                      background: "#fee2e2",
                      color: "#991b1b",
                      padding: "0.125rem 0.5rem",
                      borderRadius: "999px",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.04em",
                    }}
                  >
                    จะยกเลิก
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.625rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: "2rem", lineHeight: 1 }}>
                  {PLAN_ICON[plan]}
                </span>
                <h2
                  style={{
                    fontSize: "1.875rem",
                    fontWeight: 800,
                    color: "var(--color-brand-900)",
                    lineHeight: 1.1,
                    margin: 0,
                  }}
                >
                  {PLAN_LABELS[plan]}
                </h2>
              </div>
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--color-brand-800)",
                }}
              >
                {price && !inTrial ? (
                  <>
                    <strong style={{ fontSize: "1rem" }}>
                      {formatTHB(price.monthly)} ฿
                    </strong>{" "}
                    / เดือน
                    {sub?.billingInterval === "yearly" && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                        · billed yearly ({formatTHB(price.yearly)} ฿)
                      </span>
                    )}
                  </>
                ) : inTrial ? (
                  <span>ทดลอง Pro ฟรี ระหว่าง Closed Beta</span>
                ) : plan === "free" ? (
                  <span>ฟรีตลอดชีพ</span>
                ) : null}
              </div>
            </div>

            <Link
              href="/pricing"
              className="app-btn app-btn-primary"
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              {plan === "free" ? "🚀 อัปเกรด" : "🔄 เปลี่ยนแผน"}
            </Link>
          </div>
        </div>

        {/* Trial countdown */}
        {inTrial && (
          <div
            style={{
              padding: "0.875rem 1rem",
              background: "var(--color-accent-50)",
              border: "1px solid var(--color-accent-200)",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "var(--color-accent-800)", fontWeight: 600 }}>
                ⏳ Trial เหลืออีก{" "}
                <span style={{ fontSize: "1.25rem", fontWeight: 800 }}>
                  {trialDaysLeft}
                </span>{" "}
                วัน
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-accent-700)",
                }}
              >
                หมด{" "}
                {sub?.trialEndsAt &&
                  new Date(sub.trialEndsAt).toLocaleDateString("th-TH")}
              </span>
            </div>
            <div
              style={{
                marginTop: "0.5rem",
                height: "6px",
                background: "var(--color-accent-100)",
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${trialPctUsed}%`,
                  background: "var(--color-accent-500)",
                  transition: "width 200ms",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Usage stat cards */}
      <div className="app-card" style={{ marginBottom: "1rem" }}>
        <div className="app-card-header">
          <h2 className="app-card-title">📊 การใช้งานเดือนนี้</h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <UsageStatCard
            icon="🧾"
            label="OCR ใบเสร็จ"
            used={ocrUsed}
            limit={limits.ocrPerMonth}
            hint="reset ทุกต้นเดือน"
          />
          <UsageStatCard
            icon="👥"
            label="ผู้ใช้ในองค์กร"
            used={memberCount}
            limit={limits.users}
          />
          <UsageStatCard
            icon="🏢"
            label="บริษัท"
            used={1}
            limit={limits.businesses}
          />
          <UsageStatCard
            icon="📋"
            label="โปรเจกต์"
            used={0}
            limit={-2}
            hint="live ใน Sheets"
          />
          <UsageStatCard
            icon="💬"
            label="LINE Group"
            used={0}
            limit={limits.lineGroups}
            hint="กำลังเปิดใน S26-B"
          />
        </div>
      </div>

      {/* Beta notice */}
      {!isOnPaidPlan && plan !== "enterprise" && (
        <div
          className="app-card"
          style={{
            marginBottom: "1rem",
            background: "var(--color-accent-50)",
            border: "1px solid var(--color-accent-200)",
          }}
        >
          <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
            <div
              style={{
                flexShrink: 0,
                width: "44px",
                height: "44px",
                background: "var(--color-accent-100)",
                borderRadius: "0.625rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
              }}
            >
              🚧
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  color: "var(--color-accent-900)",
                  margin: 0,
                }}
              >
                ระบบเก็บเงินกำลังเปิดเร็ว ๆ นี้
              </h3>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-accent-800)",
                  marginTop: "0.375rem",
                  lineHeight: 1.6,
                }}
              >
                ตอนนี้อยู่ระหว่าง <strong>Closed Beta</strong> —
                ผู้ใช้ทุกคนได้ Pro features ฟรีระหว่าง trial 30 วัน
                เมื่อระบบเก็บเงินพร้อมจะส่ง email แจ้ง + แสดงปุ่มอัปเกรดที่นี่
              </p>
              <a
                href="mailto:support@aimexpense.com"
                style={{
                  display: "inline-block",
                  marginTop: "0.5rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-accent-900)",
                  textDecoration: "underline",
                }}
              >
                ติดต่อ support@aimexpense.com →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Manage subscription (Stripe Customer Portal placeholder) */}
      {isOnPaidPlan && (
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">🛠️ จัดการแผน + ใบเสร็จ</h2>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
            ดูใบเสร็จย้อนหลัง / เปลี่ยนบัตร / ยกเลิกผ่าน Stripe Customer Portal
          </p>
          <button
            className="app-btn app-btn-secondary"
            disabled
            title="Coming soon — S26-B"
            style={{ marginTop: "0.5rem" }}
          >
            เปิด Customer Portal →
          </button>
        </div>
      )}

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.5rem 0.75rem",
          padding: "1rem 0",
          fontSize: "0.75rem",
          color: "#94a3b8",
        }}
      >
        <Link href="/account/data" style={{ color: "#64748b" }}>
          จัดการข้อมูลส่วนบุคคล
        </Link>
        <span aria-hidden>·</span>
        <Link href="/pricing" style={{ color: "#64748b" }}>
          ดูราคาทั้งหมด
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" style={{ color: "#64748b" }}>
          ความเป็นส่วนตัว
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" style={{ color: "#64748b" }}>
          ข้อกำหนด
        </Link>
      </div>
    </div>
  );
}

// ===== Reusable usage stat card =====

function UsageStatCard({
  icon,
  label,
  used,
  limit,
  hint,
}: {
  icon: string;
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const isUnlimited = limit === -1;
  const isUnknown = limit === -2;
  const pct =
    isUnlimited || isUnknown
      ? 0
      : Math.min(100, (used / Math.max(1, limit)) * 100);
  const danger = pct > 90;
  const warn = pct > 75 && pct <= 90;

  const barColor = danger
    ? "#dc2626"
    : warn
      ? "#d97706"
      : "var(--color-brand-500)";

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "0.625rem",
        padding: "0.875rem",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            background: "var(--color-brand-50)",
            borderRadius: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.125rem",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          <div
            style={{
              fontSize: "0.75rem",
              color: "#64748b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.3,
            }}
          >
            {used.toLocaleString("th-TH")}
            <span
              style={{
                marginLeft: "0.25rem",
                fontSize: "0.75rem",
                fontWeight: 400,
                color: "#94a3b8",
              }}
            >
              / {formatLimit(limit)}
            </span>
          </div>
        </div>
        {danger && !isUnlimited && (
          <span
            style={{
              padding: "0.125rem 0.375rem",
              borderRadius: "999px",
              fontSize: "0.625rem",
              fontWeight: 700,
              background: "#fee2e2",
              color: "#991b1b",
              flexShrink: 0,
            }}
          >
            ใกล้เต็ม
          </span>
        )}
        {isUnlimited && (
          <span
            style={{
              padding: "0.125rem 0.375rem",
              borderRadius: "999px",
              fontSize: "0.625rem",
              fontWeight: 700,
              background: "var(--color-brand-50)",
              color: "var(--color-brand-700)",
              flexShrink: 0,
            }}
          >
            ∞
          </span>
        )}
      </div>
      {!isUnlimited && !isUnknown && (
        <div
          style={{
            marginTop: "0.5rem",
            height: "4px",
            background: "#f1f5f9",
            borderRadius: "999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              transition: "width 200ms",
            }}
          />
        </div>
      )}
      {hint && (
        <div
          style={{
            marginTop: "0.375rem",
            fontSize: "0.6875rem",
            color: "#94a3b8",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
