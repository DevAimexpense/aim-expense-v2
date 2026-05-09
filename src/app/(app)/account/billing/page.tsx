// ===========================================
// /account/billing — current plan + usage bars + upgrade CTA
// (S26-A: Stripe checkout button = "Coming soon" until live keys)
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

function formatLimit(n: number, unit = ""): string {
  if (n === -1) return `ไม่จำกัด${unit ? " " + unit : ""}`;
  return `${n.toLocaleString("th-TH")}${unit ? " " + unit : ""}`;
}

function daysFromNow(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000));
}

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

  // Read current OCR usage
  const ocrUsed = await getUsage(session.activeOrgId, "ocr");

  // Count members for usage stats. Events live in Google Sheets — counting
  // them here would need a sheets call; defer to a tRPC query if needed.
  const memberCount = await prisma.orgMember.count({
    where: { orgId: session.activeOrgId },
  });
  const eventCount = 0; // TODO(S26-B): wire `trpc.event.list` count here

  const trialDaysLeft = inTrial ? daysFromNow(sub?.trialEndsAt) : 0;
  const isOnPaidPlan =
    !!sub?.stripeSubscriptionId && sub.plan !== "free" && !inTrial;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">💳 แพ็คเกจของคุณ</h1>
          <p className="app-page-subtitle">จัดการแผน + ดูการใช้งาน + อัปเกรด</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 pb-12 sm:px-6">
        {/* Current plan card */}
        <section
          className={`rounded-2xl border-2 bg-white p-6 shadow-sm ${
            inTrial ? "border-amber-300 bg-amber-50/30" : "border-brand-200"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                แพ็คเกจปัจจุบัน
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {PLAN_LABELS[plan]}
                {inTrial && (
                  <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    🎁 Trial
                  </span>
                )}
              </h2>
              {PLAN_PRICING_THB[plan] && !inTrial && (
                <p className="mt-1 text-sm text-slate-600">
                  {formatTHB(PLAN_PRICING_THB[plan]!.monthly)} ฿/เดือน
                  {sub?.billingInterval === "yearly" && " · billed yearly"}
                </p>
              )}
              {inTrial && (
                <p className="mt-1 text-sm text-amber-800">
                  เหลือเวลา trial อีก{" "}
                  <strong>{trialDaysLeft} วัน</strong> — หมดวันที่{" "}
                  {sub?.trialEndsAt &&
                    new Date(sub.trialEndsAt).toLocaleDateString("th-TH")}
                </p>
              )}
              {sub?.cancelAtPeriodEnd && (
                <p className="mt-1 text-sm text-red-700">
                  ⚠️ จะถูกยกเลิกเมื่อ{" "}
                  {sub.currentPeriodEnd &&
                    new Date(sub.currentPeriodEnd).toLocaleDateString("th-TH")}
                </p>
              )}
            </div>
            <Link
              href="/pricing"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              {plan === "free" ? "อัปเกรด →" : "เปลี่ยนแผน →"}
            </Link>
          </div>
        </section>

        {/* Usage bars */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            📊 การใช้งานเดือนนี้
          </h2>
          <div className="mt-4 space-y-4">
            <UsageBar
              label="OCR ใบเสร็จ"
              used={ocrUsed}
              limit={limits.ocrPerMonth}
            />
            <UsageBar
              label="ผู้ใช้ในองค์กร"
              used={memberCount}
              limit={limits.users}
            />
            <UsageBar
              label="โปรเจกต์ / Events"
              used={eventCount}
              limit={limits.businesses}
              hint="(โปรเจกต์ live ใน Google Sheets — count นี้อาจ approximate)"
            />
          </div>
        </section>

        {/* Stripe Coming Soon — for S26-A (live keys not yet)*/}
        {!isOnPaidPlan && plan !== "enterprise" && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6">
            <h2 className="text-base font-semibold text-blue-900">
              🚧 ระบบเก็บเงินกำลังเปิดเร็ว ๆ นี้
            </h2>
            <p className="mt-2 text-sm text-blue-800">
              ตอนนี้ระหว่าง closed beta — ผู้ใช้ทุกคนได้ Pro features ฟรีระหว่าง trial 30 วัน. <br />
              เมื่อระบบเก็บเงินพร้อม → จะส่ง email + แสดงปุ่ม "อัปเกรด" ที่นี่
            </p>
            <p className="mt-2 text-xs text-blue-700">
              ติดต่อ: support@aimexpense.com
            </p>
          </section>
        )}

        {/* Manage subscription (Stripe Customer Portal — placeholder) */}
        {isOnPaidPlan && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              🛠️ จัดการแผน + ใบเสร็จ
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              ดูใบเสร็จย้อนหลัง / เปลี่ยนบัตร / ยกเลิกได้ผ่าน Stripe Customer Portal
            </p>
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
              disabled
              title="Coming soon"
            >
              เปิด Customer Portal
            </button>
          </section>
        )}

        <div className="text-center text-xs text-slate-400">
          <Link href="/account/data" className="hover:text-slate-600">
            จัดการข้อมูลส่วนบุคคล
          </Link>
          {" · "}
          <Link href="/privacy" className="hover:text-slate-600">
            นโยบายความเป็นส่วนตัว
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-slate-600">
            ข้อกำหนด
          </Link>
        </div>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const color =
    pct > 90
      ? "bg-red-500"
      : pct > 75
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono text-slate-600">
          {used.toLocaleString("th-TH")} / {formatLimit(limit)}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
