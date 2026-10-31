"use client";

// ===========================================
// การ์ดแพ็กเกจ + สลับรอบจ่าย — client component ตัวเดียว ใช้ทั้งหน้าแรก (3 แพ็กเกจ) และหน้า /pricing (ทุกแพ็กเกจ + Enterprise)
// - ตัวเลขทั้งหมดมาจาก src/lib/plans.ts — ห้ามพิมพ์ราคาลงที่นี่
// - ไม่มีแพ็กเกจฟรี: เริ่มที่ Basic (ทุกบัญชีได้ทดลอง Pro ฟรี 30 วันก่อน)
// - ปุ่มในหน้า /pricing: เมื่อเปิดเก็บเงิน (NEXT_PUBLIC_BILLING_ENABLED) → POST /api/stripe/checkout เหมือนเดิม
//   (ยังไม่ล็อกอิน → /login?return=/pricing) · ถ้าไม่เปิด → ไป /login เริ่มทดลองใช้ · flow เดิมของระบบไม่เปลี่ยน
// - รับ copy เป็น prop (object ของ string) เพราะข้าม RSC boundary
// ===========================================
import { useState } from "react";
import { Check } from "lucide-react";
import { PLAN_LABELS, PLAN_LIMITS, PLAN_PRICING_THB } from "@/lib/plans";
import { BILLING_ENABLED } from "@/lib/billing-flag";
import { COMPANY } from "@/lib/company";
import { buttonClass } from "./button";
import type { HOME } from "./copy";

type PricingCopy = Record<keyof (typeof HOME)["th"]["pricing"], string>;
type Interval = "monthly" | "yearly";
type PaidTier = "basic" | "pro" | "business" | "max";

const HOME_TIERS: PaidTier[] = ["basic", "pro", "business"];
const ALL_TIERS: PaidTier[] = ["basic", "pro", "business", "max"];

const TAGLINE: Record<"th" | "en", Record<PaidTier | "enterprise", string>> = {
  th: { basic: "ฟรีแลนซ์และทีมเล็ก", pro: "ครบที่สุด เหมาะกับ SME ส่วนใหญ่", business: "ทีม 5–10 คน หลายธุรกิจ", max: "หลายบริษัท ทีมใหญ่", enterprise: "เงื่อนไขและจำนวนตามตกลง" },
  en: { basic: "Freelancers and small teams", pro: "The complete set for most SMEs", business: "Teams of 5–10, several businesses", max: "Many companies, large teams", enterprise: "Custom terms and limits" },
};
const UI = {
  th: { opening: "กำลังเปิดหน้าชำระเงิน…", trial: "เริ่มทดลองฟรี 30 วัน", enterprise: "ติดต่อฝ่ายขาย", custom: "ตามตกลง", events: "โปรเจกต์", lineGroups: "กลุ่ม LINE", error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", saveYear: "ประหยัด", perYearShort: "/ปี" },
  en: { opening: "Opening checkout…", trial: "Start 30-day free trial", enterprise: "Contact sales", custom: "Custom", events: "projects", lineGroups: "LINE groups", error: "Something went wrong, please try again", saveYear: "Save", perYearShort: "/yr" },
} as const;

const fmt = (n: number) => `฿${n.toLocaleString("en-US")}`;

export function PricingCards({ t, lang = "th", full = false }: { t: PricingCopy; lang?: "th" | "en"; full?: boolean }) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const yearly = interval === "yearly";
  const tiers = full ? ALL_TIERS : HOME_TIERS;
  const ui = UI[lang];
  const lim = (n: number) => (n === -1 ? t.unlimited : n.toLocaleString("en-US"));

  return (
    <div>
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="billing interval">
          {([["monthly", t.monthly], ["yearly", t.yearly]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setInterval(v)}
              aria-pressed={interval === v}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition sm:px-5 ${interval === v ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-600">{t.yearlyHint}</p>
      </div>

      <div className={`mt-8 grid gap-6 sm:grid-cols-2 ${full ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-3"}`}>
        {tiers.map((tier) => {
          const price = PLAN_PRICING_THB[tier]!;
          const limits = PLAN_LIMITS[tier];
          const hot = tier === "pro";
          const amount = yearly ? price.yearly : price.monthly;
          const saved = price.monthly * 12 - price.yearly;
          const rows = [
            `${lim(limits.users)} ${t.users}`,
            `${lim(limits.businesses)} ${t.businesses}`,
            `${lim(limits.ocrPerMonth)} ${t.ocr}`,
            ...(full ? [`${lim(limits.events)} ${ui.events}`, `${lim(limits.lineGroups)} ${ui.lineGroups}`] : []),
          ];
          return (
            <div
              key={tier}
              className={`lift relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md ${hot ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}
            >
              {hot && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent-300 px-2 py-0.5 text-xs font-medium text-accent-900">{t.recommended}</span>
              )}
              <div className="text-sm font-semibold text-slate-700">{PLAN_LABELS[tier]}</div>
              {full && <div className="mt-0.5 text-xs text-slate-500">{TAGLINE[lang][tier]}</div>}
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{fmt(amount)}</span>
                <span className="text-sm text-slate-600">{yearly ? t.perYear : t.perMonth}</span>
              </div>
              {yearly && <div className="mt-1 text-xs font-medium text-brand-700">{ui.saveYear} {fmt(saved)}{ui.perYearShort}</div>}
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {rows.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check size={16} className="shrink-0 text-brand-600" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {full ? (
                  <PlanButton tier={tier} interval={interval} hot={hot} label={t.choose} lang={lang} />
                ) : (
                  <a href="/pricing" className={buttonClass(hot ? "primary" : "outline", "md", "w-full")}>{t.choose}</a>
                )}
              </div>
            </div>
          );
        })}

        {full && (
          <div className="lift relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md">
            <div className="text-sm font-semibold text-slate-700">{PLAN_LABELS.enterprise}</div>
            <div className="mt-0.5 text-xs text-slate-500">{TAGLINE[lang].enterprise}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{ui.custom}</div>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {[`${t.unlimited} ${t.users}`, `${t.unlimited} ${t.businesses}`, `${t.unlimited} ${t.ocr}`].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check size={16} className="shrink-0 text-brand-600" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <a href={`mailto:${COMPANY.email}?subject=Enterprise%20inquiry`} className={buttonClass("outline", "md", "w-full")}>{ui.enterprise}</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** ปุ่มเลือกแพ็กเกจในหน้า /pricing — ตรรกะเดียวกับ TierUpgradeButton เดิม (Stripe checkout) */
function PlanButton({ tier, interval, hot, label, lang }: { tier: PaidTier; interval: Interval; hot: boolean; label: string; lang: "th" | "en" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = UI[lang];
  const cls = buttonClass(hot ? "primary" : "outline", "md", "w-full");

  if (!BILLING_ENABLED) {
    return <a href="/login" className={cls}>{ui.trial}</a>;
  }

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Checkout failed");
      window.location.href = json.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : ui.error;
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
      <button type="button" onClick={onClick} disabled={loading} className={cls}>
        {loading ? ui.opening : label}
      </button>
      {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
