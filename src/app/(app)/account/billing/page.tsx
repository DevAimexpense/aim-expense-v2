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
  type PlanTier,
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
  return n.toLocaleString("th-TH");
}

function daysFromNow(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000));
}

const PLAN_THEME: Record<
  PlanTier,
  { gradient: string; ring: string; chip: string; chipText: string; icon: string }
> = {
  free: {
    gradient: "from-slate-500 to-slate-700",
    ring: "ring-slate-400",
    chip: "bg-slate-100",
    chipText: "text-slate-700",
    icon: "🌱",
  },
  basic: {
    gradient: "from-sky-500 to-blue-600",
    ring: "ring-sky-400",
    chip: "bg-sky-100",
    chipText: "text-sky-700",
    icon: "🚀",
  },
  pro: {
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    ring: "ring-purple-400",
    chip: "bg-purple-100",
    chipText: "text-purple-700",
    icon: "⭐",
  },
  business: {
    gradient: "from-indigo-500 to-blue-700",
    ring: "ring-indigo-400",
    chip: "bg-indigo-100",
    chipText: "text-indigo-700",
    icon: "💼",
  },
  max: {
    gradient: "from-amber-500 via-orange-500 to-red-500",
    ring: "ring-amber-400",
    chip: "bg-amber-100",
    chipText: "text-amber-800",
    icon: "👑",
  },
  enterprise: {
    gradient: "from-slate-800 to-slate-950",
    ring: "ring-slate-700",
    chip: "bg-slate-200",
    chipText: "text-slate-900",
    icon: "🏢",
  },
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
  const theme = PLAN_THEME[plan];

  const ocrUsed = await getUsage(session.activeOrgId, "ocr");
  const memberCount = await prisma.orgMember.count({
    where: { orgId: session.activeOrgId },
  });
  const eventCount = 0; // TODO(S26-B): wire `trpc.event.list` count

  const trialDaysLeft = inTrial ? daysFromNow(sub?.trialEndsAt) : 0;
  const trialTotalDays = 30;
  const trialPctUsed = inTrial
    ? Math.min(100, ((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100)
    : 0;
  const isOnPaidPlan =
    !!sub?.stripeSubscriptionId && sub.plan !== "free" && !inTrial;
  const price = PLAN_PRICING_THB[plan];

  return (
    <div className="app-page">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-16 sm:px-6">
        {/* ===== Hero plan card ===== */}
        <section
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradient} px-6 py-8 text-white shadow-xl sm:px-10 sm:py-10`}
        >
          {/* decorative blobs */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/80">
                <span>แพ็คเกจปัจจุบัน</span>
                {inTrial && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">
                    🎁 Free Trial
                  </span>
                )}
                {sub?.cancelAtPeriodEnd && (
                  <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-[10px]">
                    จะยกเลิก
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-5xl drop-shadow-sm">{theme.icon}</span>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {PLAN_LABELS[plan]}
                </h1>
              </div>
              {price && !inTrial ? (
                <p className="mt-3 text-base text-white/90">
                  <span className="text-2xl font-bold">
                    {formatTHB(price.monthly)} ฿
                  </span>{" "}
                  / เดือน
                  {sub?.billingInterval === "yearly" && (
                    <span className="ml-2 text-sm text-white/70">
                      · billed yearly ({formatTHB(price.yearly)} ฿)
                    </span>
                  )}
                </p>
              ) : inTrial ? (
                <p className="mt-3 text-base text-white/90">
                  ทดลอง Pro ฟรีระหว่าง closed beta
                </p>
              ) : plan === "free" ? (
                <p className="mt-3 text-base text-white/90">ฟรีตลอดชีพ</p>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 flex-col gap-2 sm:items-end">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:scale-105 hover:shadow-xl"
              >
                {plan === "free" ? "🚀 อัปเกรด" : "🔄 เปลี่ยนแผน"}
                <span aria-hidden>→</span>
              </Link>
              {sub?.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                <p className="text-xs text-white/80">
                  ยกเลิก{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString("th-TH")}
                </p>
              )}
            </div>
          </div>

          {/* Trial countdown — prominent if in trial */}
          {inTrial && (
            <div className="relative mt-8 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  ⏳ Trial เหลือ{" "}
                  <span className="text-2xl font-extrabold">
                    {trialDaysLeft}
                  </span>{" "}
                  วัน
                </span>
                <span className="text-xs text-white/70">
                  หมด{" "}
                  {sub?.trialEndsAt &&
                    new Date(sub.trialEndsAt).toLocaleDateString("th-TH")}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-white/80 transition-all"
                  style={{ width: `${trialPctUsed}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* ===== Usage stat cards ===== */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
            <span>📊</span> การใช้งานเดือนนี้
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <UsageStatCard
              icon="🧾"
              label="OCR ใบเสร็จ"
              used={ocrUsed}
              limit={limits.ocrPerMonth}
              color="emerald"
              hint="reset ทุกต้นเดือน"
            />
            <UsageStatCard
              icon="👥"
              label="ผู้ใช้ในองค์กร"
              used={memberCount}
              limit={limits.users}
              color="sky"
            />
            <UsageStatCard
              icon="🏢"
              label="บริษัท"
              used={1}
              limit={limits.businesses}
              color="violet"
            />
            <UsageStatCard
              icon="📋"
              label="โปรเจกต์ / Events"
              used={eventCount}
              limit={-2 /* placeholder until S26-B wires sheet count */}
              color="amber"
              hint="live ใน Google Sheets"
            />
            <UsageStatCard
              icon="💬"
              label="LINE Group bot"
              used={0}
              limit={limits.lineGroups}
              color="green"
              hint="กำลังเปิดใช้ S26-B"
            />
          </div>
        </section>

        {/* ===== Beta notice (S26-A: Stripe not live) ===== */}
        {!isOnPaidPlan && plan !== "enterprise" && (
          <section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                🚧
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-amber-900">
                  ระบบเก็บเงินกำลังเปิดเร็ว ๆ นี้
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-amber-800">
                  ตอนนี้อยู่ระหว่าง <strong>Closed Beta</strong> —
                  ผู้ใช้ทุกคนได้ Pro features ฟรีระหว่าง trial 30 วัน. <br />
                  เมื่อระบบเก็บเงินพร้อม → ส่ง email + แสดงปุ่ม "อัปเกรด" ที่นี่
                </p>
                <a
                  href="mailto:support@aimexpense.com"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 hover:underline"
                >
                  ติดต่อ support@aimexpense.com →
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ===== Manage subscription (Stripe Customer Portal — S26-B placeholder) ===== */}
        {isOnPaidPlan && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">
                🛠️
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  จัดการแผน + ใบเสร็จ
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  ดูใบเสร็จย้อนหลัง / เปลี่ยนบัตร / ยกเลิกผ่าน Stripe Customer Portal
                </p>
                <button
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled
                  title="Coming soon — S26-B"
                >
                  เปิด Customer Portal →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===== Footer links ===== */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-4 text-xs text-slate-400">
          <Link
            href="/account/data"
            className="transition hover:text-slate-600"
          >
            จัดการข้อมูลส่วนบุคคล
          </Link>
          <span aria-hidden>·</span>
          <Link href="/pricing" className="transition hover:text-slate-600">
            ดูราคาทั้งหมด
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="transition hover:text-slate-600">
            ความเป็นส่วนตัว
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="transition hover:text-slate-600">
            ข้อกำหนด
          </Link>
        </div>
      </div>
    </div>
  );
}

// ===== Reusable usage stat card =====

const COLOR_MAP: Record<
  string,
  { bg: string; bar: string; text: string; ring: string }
> = {
  emerald: {
    bg: "bg-emerald-50",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  sky: {
    bg: "bg-sky-50",
    bar: "bg-sky-500",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
  violet: {
    bg: "bg-violet-50",
    bar: "bg-violet-500",
    text: "text-violet-700",
    ring: "ring-violet-200",
  },
  amber: {
    bg: "bg-amber-50",
    bar: "bg-amber-500",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  green: {
    bg: "bg-green-50",
    bar: "bg-green-500",
    text: "text-green-700",
    ring: "ring-green-200",
  },
};

function UsageStatCard({
  icon,
  label,
  used,
  limit,
  color,
  hint,
}: {
  icon: string;
  label: string;
  used: number;
  limit: number;
  color: string;
  hint?: string;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.sky;
  const isUnlimited = limit === -1;
  const isUnknown = limit === -2;
  const pct = isUnlimited || isUnknown ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const dangerLevel = pct > 90 ? "danger" : pct > 75 ? "warn" : "ok";

  const barColor =
    dangerLevel === "danger"
      ? "bg-red-500"
      : dangerLevel === "warn"
        ? "bg-amber-500"
        : c.bar;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} text-lg`}
          >
            {icon}
          </span>
          <div>
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-lg font-bold text-slate-900">
              {used.toLocaleString("th-TH")}
              <span className="ml-1 text-xs font-normal text-slate-400">
                / {isUnknown ? "—" : formatLimit(limit)}
              </span>
            </div>
          </div>
        </div>
        {dangerLevel === "danger" && !isUnlimited && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            ใกล้เต็ม
          </span>
        )}
        {dangerLevel === "warn" && !isUnlimited && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {Math.round(pct)}%
          </span>
        )}
        {isUnlimited && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            ∞
          </span>
        )}
      </div>
      {!isUnlimited && !isUnknown && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}
