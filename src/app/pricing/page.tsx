// ===========================================
// /pricing — Public marketing page (no auth required)
// 6-tier comparison from Excel pricing roadmap.
// Server-rendered for SEO; tier cards + interval toggle are a client component.
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
    <main className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              A
            </div>
            <span className="font-semibold text-slate-900">{COMPANY_NAME}</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-600">
            ราคาที่เหมาะกับธุรกิจของคุณ
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            ลงทุนกับเครื่องมือที่ทำให้บัญชีของคุณง่ายขึ้น
          </h1>
          <p className="mt-3 text-slate-600">
            <strong>ทดลองฟรี 30 วัน — ใช้ Pro feature ครบ ไม่ต้องใช้บัตรเครดิต</strong>
            <br />
            หลังหมด trial → กลายเป็น Free Forever (5 OCR/เดือน) หรืออัปเกรดได้ตลอด
          </p>
        </div>

        {/* Pricing cards (client — handles interval toggle + Stripe redirect) */}
        <PricingCardsClient prices={prices} />

        {/* Detailed comparison table */}
        <div className="mx-auto mt-16 max-w-6xl overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  Feature
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier}
                    className="px-4 py-3 text-center font-semibold text-slate-700"
                  >
                    {PLAN_LABELS[tier]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Quantitative limits */}
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <td className="px-4 py-2 font-medium text-slate-700">ผู้ใช้</td>
                {TIERS.map((t) => (
                  <td key={t} className="px-4 py-2 text-center text-slate-700">
                    {PLAN_LIMITS[t].users === -1
                      ? "∞"
                      : PLAN_LIMITS[t].users}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <td className="px-4 py-2 font-medium text-slate-700">บริษัท</td>
                {TIERS.map((t) => (
                  <td key={t} className="px-4 py-2 text-center text-slate-700">
                    {PLAN_LIMITS[t].businesses === -1
                      ? "∞"
                      : PLAN_LIMITS[t].businesses}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <td className="px-4 py-2 font-medium text-slate-700">OCR / เดือน</td>
                {TIERS.map((t) => (
                  <td key={t} className="px-4 py-2 text-center text-slate-700">
                    {PLAN_LIMITS[t].ocrPerMonth === -1
                      ? "∞"
                      : PLAN_LIMITS[t].ocrPerMonth.toLocaleString("th-TH")}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <td className="px-4 py-2 font-medium text-slate-700">LINE Group</td>
                {TIERS.map((t) => (
                  <td key={t} className="px-4 py-2 text-center text-slate-700">
                    {PLAN_LIMITS[t].lineGroups === -1
                      ? "∞"
                      : PLAN_LIMITS[t].lineGroups || "—"}
                  </td>
                ))}
              </tr>
              {/* Feature toggles */}
              {FEATURE_TOGGLES.map((row) => (
                <tr key={row.label} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700">{row.label}</td>
                  {TIERS.map((tier) => (
                    <td key={tier} className="px-4 py-2.5 text-center">
                      {row.enabledOn.includes(tier) ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add-ons + Affiliate */}
        <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              🛒 Add-ons (ซื้อเพิ่มได้ทุกแผน)
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              <li>• +100 OCR scans = <strong>89 ฿</strong> (one-time top-up)</li>
              <li>• +1 user seat = <strong>49 ฿</strong>/เดือน</li>
              <li>• Custom doc template = <strong>1,990 ฿</strong> one-time</li>
              <li>• Migration จาก Paypers/Excel = <strong>ส่วนลด 50% เดือนแรก</strong></li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">
              🎁 มี code อัปเกรด?
            </h2>
            <p className="mt-3 text-sm text-amber-800">
              ใส่ referral code ของเพื่อน หรือ partner code → รับ
              <strong> ส่วนลด 20% เดือนแรก + 100 OCR ฟรี</strong>
            </p>
            <p className="mt-2 text-xs text-amber-700">
              เข้าผ่าน link จาก partner (`?ref=CODE`) → จะ apply อัตโนมัติตอน checkout
            </p>
          </div>
        </div>

        {/* Footer FAQ */}
        <div className="mx-auto mt-12 max-w-3xl text-center text-sm text-slate-500">
          <p>
            มีคำถามเรื่องราคา?{" "}
            <a href="mailto:support@aimexpense.com" className="text-brand-600 hover:underline">
              support@aimexpense.com
            </a>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            ราคารวม VAT 7%. Stripe เก็บเงินผ่านบัตรเครดิต/PromptPay. ยกเลิกได้ตลอดเวลา ไม่มี lock-in.
          </p>
        </div>
      </div>
    </main>
  );
}
