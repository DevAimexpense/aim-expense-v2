"use client";

// ===========================================
// /pricing client-side bits — interval toggle + tier upgrade buttons
// Server page renders the static comparison; this handles the dynamic actions.
// Visual language matches the app's app-card / app-btn / brand palette.
// ===========================================

import { useEffect, useState } from "react";
import type { PlanTier } from "@/lib/plans";

type Interval = "monthly" | "yearly";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

interface PriceMap {
  basic: { monthly: number; yearly: number };
  pro: { monthly: number; yearly: number };
  business: { monthly: number; yearly: number };
  max: { monthly: number; yearly: number };
}

export function IntervalToggle({
  interval,
  setInterval,
}: {
  interval: Interval;
  setInterval: (i: Interval) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        gap: "0.25rem",
        background: "white",
        border: "1px solid var(--border-color)",
        borderRadius: "999px",
        padding: "0.25rem",
      }}
    >
      <button
        type="button"
        onClick={() => setInterval("monthly")}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          borderRadius: "999px",
          background:
            interval === "monthly" ? "var(--color-brand-600)" : "transparent",
          color: interval === "monthly" ? "white" : "#475569",
          border: "none",
          cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        รายเดือน
      </button>
      <button
        type="button"
        onClick={() => setInterval("yearly")}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          borderRadius: "999px",
          background:
            interval === "yearly" ? "var(--color-brand-600)" : "transparent",
          color: interval === "yearly" ? "white" : "#475569",
          border: "none",
          cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        รายปี{" "}
        <span
          style={{
            fontSize: "0.6875rem",
            fontWeight: 700,
            background:
              interval === "yearly"
                ? "rgba(255,255,255,0.25)"
                : "var(--color-accent-100)",
            color:
              interval === "yearly" ? "white" : "var(--color-accent-800)",
            padding: "0.0625rem 0.375rem",
            borderRadius: "999px",
            marginLeft: "0.25rem",
          }}
        >
          ประหยัด 17%
        </span>
      </button>
    </div>
  );
}

export function TierUpgradeButton({
  tier,
  interval,
  highlight,
  label,
}: {
  tier: PlanTier;
  interval: Interval;
  highlight?: boolean;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (tier === "free" || tier === "enterprise") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Checkout failed");
      }
      window.location.href = json.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      // 401 = not logged in → push to /login then return to /pricing
      if (msg.toLowerCase().includes("unauthorized")) {
        window.location.href = "/login?return=/pricing";
        return;
      }
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`app-btn ${highlight ? "app-btn-primary" : "app-btn-secondary"}`}
        style={{ width: "100%", fontWeight: 700 }}
      >
        {loading ? "กำลังเปิด Stripe…" : label}
      </button>
      {error && (
        <p
          style={{
            marginTop: "0.375rem",
            fontSize: "0.75rem",
            color: "var(--color-error)",
            textAlign: "center",
          }}
        >
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

/**
 * Static contact-sales button for Enterprise tier (no Stripe checkout).
 */
export function ContactSalesButton() {
  return (
    <a
      href="mailto:sales@aimexpense.com?subject=Enterprise%20inquiry"
      className="app-btn app-btn-secondary"
      style={{ width: "100%", fontWeight: 700 }}
    >
      ติดต่อฝ่ายขาย
    </a>
  );
}

/**
 * Free-tier "เริ่มฟรี" button → just goes to /login (no stripe).
 */
export function StartFreeButton() {
  return (
    <a
      href="/login"
      className="app-btn app-btn-secondary"
      style={{ width: "100%", fontWeight: 700 }}
    >
      เริ่มฟรี
    </a>
  );
}

/**
 * Show & let user toggle interval. Renders prices that update in sync.
 */
export function PricingCardsClient({ prices }: { prices: PriceMap }) {
  const [interval, setIntervalState] = useState<Interval>("monthly");

  // Read aim_ref cookie + display affiliate notice if set
  const [refCode, setRefCode] = useState<string | null>(null);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)aim_ref=([^;]+)/);
    if (m) setRefCode(decodeURIComponent(m[1]));
  }, []);

  const tiers: Array<{
    tier: PlanTier;
    label: string;
    tagline: string;
    highlight?: boolean;
    badge?: string;
  }> = [
    { tier: "free", label: "Free Forever", tagline: "ไม่มีค่าใช้จ่าย" },
    { tier: "basic", label: "Basic", tagline: "Freelance / micro" },
    {
      tier: "pro",
      label: "Pro",
      tagline: "ครบที่สุด — เหมาะกับ SME ส่วนใหญ่",
      highlight: true,
      badge: "ยอดนิยม ⭐",
    },
    { tier: "business", label: "Business", tagline: "ทีม 5-10 คน" },
    { tier: "max", label: "Max", tagline: "Mid-market + API" },
    {
      tier: "enterprise",
      label: "Enterprise",
      tagline: "Custom + dedicated CSM",
    },
  ];

  return (
    <div style={{ marginTop: "1.75rem" }}>
      {/* Interval toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "1.5rem",
        }}
      >
        <IntervalToggle interval={interval} setInterval={setIntervalState} />
      </div>

      {refCode && (
        <div
          style={{
            margin: "0 auto 1.5rem auto",
            maxWidth: "640px",
            background: "var(--color-accent-50)",
            border: "1px solid var(--color-accent-200)",
            borderRadius: "0.75rem",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            color: "var(--color-accent-900)",
            textAlign: "center",
          }}
        >
          🎁 Code <strong>{refCode}</strong> applied — ส่วนลด 20% เดือนแรก + 100
          OCR ฟรี (จะคำนวณตอน checkout)
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "0.875rem",
        }}
      >
        {tiers.map((t) => {
          const price =
            t.tier === "basic" ||
            t.tier === "pro" ||
            t.tier === "business" ||
            t.tier === "max"
              ? prices[t.tier as "basic" | "pro" | "business" | "max"][interval]
              : null;
          return (
            <div
              key={t.tier}
              className="app-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                ...(t.highlight
                  ? {
                      borderColor: "var(--color-brand-500)",
                      borderWidth: "2px",
                      boxShadow:
                        "0 10px 20px -5px rgba(37, 99, 235, 0.18)",
                    }
                  : {}),
              }}
            >
              {t.badge && (
                <span
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--color-brand-600)",
                    color: "white",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "999px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                  }}
                >
                  {t.badge}
                </span>
              )}
              <div>
                <h3
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    margin: 0,
                    color: "#0f172a",
                  }}
                >
                  {t.label}
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    marginTop: "0.25rem",
                  }}
                >
                  {t.tagline}
                </p>
              </div>
              <div>
                {price !== null ? (
                  <>
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 800,
                        color: "var(--color-brand-700)",
                      }}
                    >
                      {formatTHB(price)}{" "}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 400,
                          color: "#64748b",
                        }}
                      >
                        ฿/{interval === "monthly" ? "เดือน" : "ปี"}
                      </span>
                    </div>
                    {interval === "yearly" && (
                      <div
                        style={{
                          fontSize: "0.6875rem",
                          color: "var(--color-success)",
                        }}
                      >
                        ประหยัด{" "}
                        {formatTHB(
                          prices[
                            t.tier as "basic" | "pro" | "business" | "max"
                          ].monthly *
                            12 -
                            prices[
                              t.tier as "basic" | "pro" | "business" | "max"
                            ].yearly,
                        )}{" "}
                        ฿/ปี
                      </div>
                    )}
                  </>
                ) : t.tier === "enterprise" ? (
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    Custom
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    ฟรี
                  </div>
                )}
              </div>
              <div style={{ marginTop: "auto" }}>
                {t.tier === "free" ? (
                  <StartFreeButton />
                ) : t.tier === "enterprise" ? (
                  <ContactSalesButton />
                ) : (
                  <TierUpgradeButton
                    tier={t.tier}
                    interval={interval}
                    highlight={t.highlight}
                    label={
                      t.highlight ? `เลือก ${t.label} ⭐` : `เลือก ${t.label}`
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
