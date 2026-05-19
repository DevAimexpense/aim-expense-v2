// ===========================================
// /pricing — Public marketing page (no auth required)
// 6-tier comparison from Excel pricing roadmap.
// Server-rendered for SEO; tier cards + interval toggle are a client component.
// Uses the project's app-page / app-card / app-btn + brand palette
// (matches /account/billing — see commit eb2b3d7).
// ===========================================

import Link from "next/link";
import type { Metadata } from "next";
import {
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_PRICING_THB,
  type PlanTier,
} from "@/lib/plans";
import { COMPANY_NAME } from "@/lib/legal/version";
import { PricingCardsClient } from "./pricing-actions";

export const metadata: Metadata = {
  title: `ราคา · ${COMPANY_NAME}`,
  description:
    "ราคา Aim Expense — Free Forever ไปจนถึง Enterprise พร้อม 30-day Pro trial ไม่ต้องใช้บัตรเครดิต",
};

const TIERS: PlanTier[] = [
  "free",
  "basic",
  "pro",
  "business",
  "max",
  "enterprise",
];

const FEATURE_TOGGLES: { label: string; enabledOn: PlanTier[] }[] = [
  {
    label: "บันทึกรายจ่าย + LINE OA",
    enabledOn: ["free", "basic", "pro", "business", "max", "enterprise"],
  },
  {
    label: "Receipt OCR",
    enabledOn: ["free", "basic", "pro", "business", "max", "enterprise"],
  },
  {
    label: "Approval Flow (basic)",
    enabledOn: ["basic", "pro", "business", "max", "enterprise"],
  },
  {
    label: "WHT Certificate (auto)",
    enabledOn: ["basic", "pro", "business", "max", "enterprise"],
  },
  {
    label: "ใบรับรองแทนใบเสร็จ",
    enabledOn: ["basic", "pro", "business", "max", "enterprise"],
  },
  {
    label: "Multi-step Approval",
    enabledOn: ["pro", "business", "max", "enterprise"],
  },
  {
    label: "ใบสำคัญรับเงิน + e-sig",
    enabledOn: ["pro", "business", "max", "enterprise"],
  },
  {
    label: "ใบเสนอราคา / ใบวางบิล / ใบกำกับภาษี",
    enabledOn: ["pro", "business", "max", "enterprise"],
  },
  { label: "P&L per Project", enabledOn: ["pro", "business", "max", "enterprise"] },
  { label: "ภ.พ.30 + WHT Report", enabledOn: ["pro", "business", "max", "enterprise"] },
  { label: "Custom branding บน PDF", enabledOn: ["max", "enterprise"] },
  { label: "API access", enabledOn: ["max", "enterprise"] },
  { label: "Audit Log Export", enabledOn: ["max", "enterprise"] },
  { label: "SSO + SLA 99.9%", enabledOn: ["enterprise"] },
];

export default function PricingPage() {
  // Bundle prices for client component (avoids re-importing PLAN_PRICING_THB there)
  const prices = {
    basic: PLAN_PRICING_THB.basic!,
    pro: PLAN_PRICING_THB.pro!,
    business: PLAN_PRICING_THB.business!,
    max: PLAN_PRICING_THB.max!,
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-secondary)" }}>
      {/* Top nav — /pricing is public, so it carries its own header */}
      <header
        style={{
          borderBottom: "1px solid var(--border-color)",
          background: "white",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.5rem",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                height: "32px",
                width: "32px",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.5rem",
                background:
                  "linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "white",
              }}
            >
              A
            </div>
            <span style={{ fontWeight: 600, color: "#0f172a" }}>
              {COMPANY_NAME}
            </span>
          </Link>
          <Link href="/login" className="app-btn app-btn-primary">
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <div className="app-page">
        {/* Hero */}
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-brand-600)",
            }}
          >
            ราคาที่เหมาะกับธุรกิจของคุณ
          </p>
          <h1
            className="app-page-title"
            style={{ marginTop: "0.5rem", fontSize: "1.875rem" }}
          >
            ลงทุนกับเครื่องมือที่ทำให้บัญชีของคุณง่ายขึ้น
          </h1>
          <p
            className="app-page-subtitle"
            style={{ marginTop: "0.625rem", lineHeight: 1.7 }}
          >
            <strong style={{ color: "#334155" }}>
              ทดลองฟรี 30 วัน — ใช้ Pro feature ครบ ไม่ต้องใช้บัตรเครดิต
            </strong>
            <br />
            หลังหมด trial → กลายเป็น Free Forever (5 OCR/เดือน) หรืออัปเกรดได้ตลอด
          </p>
        </div>

        {/* Pricing cards (client — handles interval toggle + Stripe redirect) */}
        <PricingCardsClient prices={prices} />

        {/* Detailed comparison table */}
        <div
          className="app-card"
          style={{ marginTop: "2.5rem", padding: 0, overflowX: "auto" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--color-brand-50)" }}>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--color-brand-900)",
                  }}
                >
                  Feature
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier}
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "center",
                      fontWeight: 600,
                      color: "var(--color-brand-900)",
                    }}
                  >
                    {PLAN_LABELS[tier]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Quantitative limits */}
              {(
                [
                  ["ผู้ใช้", "users"],
                  ["บริษัท", "businesses"],
                  ["OCR / เดือน", "ocrPerMonth"],
                  ["LINE Group", "lineGroups"],
                ] as const
              ).map(([label, key]) => (
                <tr
                  key={key}
                  style={{
                    borderTop: "1px solid #f1f5f9",
                    background: "#f8fafc",
                  }}
                >
                  <td
                    style={{
                      padding: "0.5rem 1rem",
                      fontWeight: 500,
                      color: "#334155",
                    }}
                  >
                    {label}
                  </td>
                  {TIERS.map((t) => {
                    const v = PLAN_LIMITS[t][key];
                    return (
                      <td
                        key={t}
                        style={{
                          padding: "0.5rem 1rem",
                          textAlign: "center",
                          color: "#334155",
                        }}
                      >
                        {v === -1
                          ? "∞"
                          : v === 0 && key === "lineGroups"
                            ? "—"
                            : v.toLocaleString("th-TH")}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Feature toggles */}
              {FEATURE_TOGGLES.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.625rem 1rem", color: "#334155" }}>
                    {row.label}
                  </td>
                  {TIERS.map((tier) => (
                    <td
                      key={tier}
                      style={{ padding: "0.625rem 1rem", textAlign: "center" }}
                    >
                      {row.enabledOn.includes(tier) ? (
                        <span style={{ color: "var(--color-success)" }}>✓</span>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add-ons + Affiliate */}
        <div
          style={{
            marginTop: "1.5rem",
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <div className="app-card">
            <div className="app-card-header">
              <h2 className="app-card-title">🛒 Add-ons (ซื้อเพิ่มได้ทุกแผน)</h2>
            </div>
            <ul
              style={{
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
                fontSize: "0.875rem",
                color: "#334155",
              }}
            >
              <li>• +100 OCR scans = <strong>89 ฿</strong> (one-time top-up)</li>
              <li>• +1 user seat = <strong>49 ฿</strong>/เดือน</li>
              <li>• Custom doc template = <strong>1,990 ฿</strong> one-time</li>
              <li>
                • Migration จาก Paypers/Excel ={" "}
                <strong>ส่วนลด 50% เดือนแรก</strong>
              </li>
            </ul>
          </div>
          <div
            className="app-card"
            style={{
              background: "var(--color-accent-50)",
              borderColor: "var(--color-accent-200)",
            }}
          >
            <div className="app-card-header">
              <h2
                className="app-card-title"
                style={{ color: "var(--color-accent-900)" }}
              >
                🎁 มี code อัปเกรด?
              </h2>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-accent-800)",
                lineHeight: 1.7,
              }}
            >
              ใส่ referral code ของเพื่อน หรือ partner code → รับ{" "}
              <strong>ส่วนลด 20% เดือนแรก + 100 OCR ฟรี</strong>
            </p>
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                color: "var(--color-accent-700)",
              }}
            >
              เข้าผ่าน link จาก partner (?ref=CODE) → จะ apply อัตโนมัติตอน
              checkout
            </p>
          </div>
        </div>

        {/* Footer FAQ */}
        <div
          style={{
            margin: "2rem auto 0",
            maxWidth: "640px",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "#64748b",
          }}
        >
          <p>
            มีคำถามเรื่องราคา?{" "}
            <a
              href="mailto:support@aimexpense.com"
              style={{ color: "var(--color-brand-600)" }}
            >
              support@aimexpense.com
            </a>
          </p>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "#94a3b8",
            }}
          >
            ราคารวม VAT 7%. ชำระผ่านบัตรเครดิต/เดบิต. ยกเลิกได้ตลอดเวลา ไม่มี
            lock-in.
          </p>
        </div>
      </div>
    </main>
  );
}
