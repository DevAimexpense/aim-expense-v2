// ===========================================
// Aim Expense — สิทธิ์ที่ทีมงานให้ลูกค้าเอง (ไม่ผ่าน Stripe)
//
//   ฟรี N เดือน   = ใช้กลไก trial เดิม (trialPlan + trialEndsAt) → effectivePlan()
//                   คืน trialPlan จนหมดอายุ แล้ว cron expire-trials ล้างให้เอง
//   ฟรีตลอดชีพ   = plan = แพ็กเกจที่ให้ + isBetaTester = true (comped)
//                   ไม่มีวันหมดอายุ และ Stripe webhook จะไม่ทับ plan
//
// ใช้ร่วมกันทั้ง backoffice router และ scripts/setup-backoffice.ts
// ===========================================

import { PLAN_LIMITS, PLAN_TIERS, type PlanTier } from "@/lib/plans";

/** แพ็กเกจที่ทีมงานให้ได้ (ไม่รวม free — นั่นคือการยกเลิกสิทธิ์) */
export const GRANTABLE_PLANS = PLAN_TIERS.filter(
  (t) => t !== "free",
) as Exclude<PlanTier, "free">[];

export const GRANT_MONTH_OPTIONS = [1, 2, 3] as const;

/** Quota cache บนแถว Subscription (mirror ของ Stripe webhook: -1 → sentinel ใหญ่) */
export function quotaCacheFor(tier: PlanTier): {
  maxMembers: number;
  maxEvents: number;
  scanCredits: number;
} {
  const l = PLAN_LIMITS[tier];
  return {
    maxMembers: l.users === -1 ? 9999 : l.users,
    maxEvents: l.events === -1 ? 9999 : l.events,
    scanCredits: l.ocrPerMonth === -1 ? 999999 : l.ocrPerMonth,
  };
}

/** ข้อมูลที่ต้องเขียนลง Subscription เมื่อให้ "ฟรีตลอดชีพ" */
export function lifetimeGrantData(tier: PlanTier) {
  return {
    plan: tier,
    status: "active",
    isBetaTester: true,
    cancelAtPeriodEnd: false,
    // ล้าง trial — ไม่งั้น effectivePlan() จะคืน trialPlan แทน
    trialPlan: null,
    trialStartedAt: null,
    trialEndsAt: null,
    ...quotaCacheFor(tier),
  };
}

/** วันหมดอายุของ "ฟรี N เดือน" — ต่อท้ายของเดิมถ้ายังไม่หมด */
export function freeMonthsEnd(
  months: number,
  currentEnd: Date | null | undefined,
  now: Date = new Date(),
): Date {
  const base =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  return end;
}
