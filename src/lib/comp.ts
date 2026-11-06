// ===========================================
// Aim Expense — สิทธิ์ที่ทีมงานให้ลูกค้าเอง (ไม่ผ่าน Stripe)
//
//   ฟรี N เดือน   = ใช้กลไก trial เดิม (trialPlan + trialEndsAt) → effectivePlan()
//                   คืน trialPlan จนหมดอายุ แล้ว cron expire-trials ล้างให้เอง
//   ฟรีตลอดชีพ   = plan = แพ็กเกจที่ให้ + isBetaTester = true (comped)
//                   ไม่มีวันหมดอายุ และ Stripe webhook จะไม่ทับ plan
//   วางบิล/โอน    = ลูกค้าจ่ายเงินจริงนอก Stripe: plan = แพ็กเกจ + status = INVOICE_STATUS
//                   + billingPeriodStart/End = รอบที่จ่ายแล้ว · หมดรอบแล้ว cron
//                   expire-manual-plans ลดเป็น free · นับเป็น "ลูกค้าจ่ายจริง"
//
// ใช้ร่วมกันทั้ง backoffice router และ scripts/setup-backoffice.ts
// ===========================================

import { PLAN_LIMITS, PLAN_TIERS, type PlanTier } from "@/lib/plans";
import { todayBangkok } from "@/lib/utils/date";

/** แพ็กเกจที่ทีมงานให้ได้ (ไม่รวม free — นั่นคือการยกเลิกสิทธิ์) */
export const GRANTABLE_PLANS = PLAN_TIERS.filter(
  (t) => t !== "free",
) as Exclude<PlanTier, "free">[];

export const GRANT_MONTH_OPTIONS = [1, 2, 3] as const;

/** Subscription.status ของลูกค้าที่จ่ายแบบวางบิล/โอน (ไม่มี Stripe subscription) */
export const INVOICE_STATUS = "manual_invoice";

/** รอบบิลของการวางบิล */
export const INVOICE_INTERVALS = ["monthly", "yearly"] as const;
export type InvoiceInterval = (typeof INVOICE_INTERVALS)[number];

/** แพ็กเกจที่วางบิลได้ = แพ็กเกจที่ขายจริง (ไม่รวม free · enterprise ตกลงราคากับทีม) */
export const INVOICE_PLANS = GRANTABLE_PLANS;

export interface InvoiceState {
  status: string;
  stripeSubscriptionId?: string | null;
  billingPeriodEnd?: Date | string | null;
}

/** แถวนี้เป็นลูกค้าวางบิลหรือไม่ (ไม่ดูวันหมดอายุ) */
export function isInvoicePlan(sub: InvoiceState | null | undefined): boolean {
  return !!sub && sub.status === INVOICE_STATUS && !sub.stripeSubscriptionId;
}

/** วางบิลและรอบที่จ่ายยังไม่หมด */
export function isInvoiceActive(
  sub: InvoiceState | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isInvoicePlan(sub) || !sub?.billingPeriodEnd) return false;
  const end =
    sub.billingPeriodEnd instanceof Date ? sub.billingPeriodEnd : new Date(sub.billingPeriodEnd);
  return end.getTime() > now.getTime();
}

/** สิ้นวัน (23:59:59 เวลาไทย) ของวันที่ YYYY-MM-DD — = 16:59:59Z วันเดียวกัน จึงแสดงวันตรงกันทั้ง server(UTC)/browser(ไทย) */
export function bangkokEndOfDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59+07:00`);
}

/**
 * รอบวางบิลถัดไป — ต่อท้ายรอบเดิมถ้ายังไม่หมด (extend) ไม่งั้นเริ่มวันนี้
 * monthly = +1 เดือน · yearly = +12 เดือน (31 ม.ค. + 1 = 28/29 ก.พ. ด้วย addMonthsClamped)
 * วันหมดอายุ = สิ้นวันเวลาไทย (BO-04) — ไม่ใช่เวลานาทีที่ทีมกด
 */
export function manualPeriodEnd(
  interval: InvoiceInterval,
  currentEnd: Date | null | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const start =
    currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  // บวกเดือนบนวันที่เวลาไทย (ไม่ใช่ UTC) แล้วปัดเป็นสิ้นวันไทย
  const startYmd = todayBangkok(start);
  const localStart = new Date(`${startYmd}T12:00:00+07:00`);
  const endYmd = todayBangkok(addMonthsClamped(localStart, interval === "yearly" ? 12 : 1));
  return { start, end: bangkokEndOfDay(endYmd) };
}

/** บวกเดือนแบบไม่ล้นวัน: 31/01 + 1 → 28/02 (หรือ 29/02) */
export function addMonthsClamped(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

/** ข้อมูลที่ต้องเขียนลง Subscription เมื่อกำหนดแพ็กเกจแบบวางบิล · interval = null เมื่อกำหนดวันหมดอายุเอง */
export function invoiceGrantData(
  tier: PlanTier,
  interval: InvoiceInterval | null,
  start: Date,
  end: Date,
) {
  return {
    plan: tier,
    status: INVOICE_STATUS,
    billingInterval: interval,
    billingPeriodStart: start,
    billingPeriodEnd: end,
    // วางบิล = จ่ายจริง ไม่ใช่ comped · ล้าง trial ไม่งั้น effectivePlan คืน trialPlan
    isBetaTester: false,
    cancelAtPeriodEnd: false,
    trialPlan: null,
    trialStartedAt: null,
    trialEndsAt: null,
    // แถวเก่าที่ยกเลิก Stripe ไปแล้ว — ล้าง id ทิ้ง ไม่งั้น UI/คิวรีนึกว่า Stripe ดูแลอยู่
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodEnd: null,
    ...quotaCacheFor(tier),
  };
}

/** ข้อมูลเมื่อรอบวางบิลหมด / ทีมงานยกเลิก → กลับแผนฟรี (ข้อมูลลูกค้าในชีตยังอยู่ครบ) */
export function invoiceEndData() {
  return {
    plan: "free" as PlanTier,
    status: "canceled",
    billingPeriodEnd: null,
    billingPeriodStart: null,
    billingInterval: null,
    ...quotaCacheFor("free"),
  };
}

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
    // BO-07: ทับแผนวางบิล → ล้างรอบวางบิลด้วย ไม่ให้ค้าง
    billingPeriodStart: null,
    billingPeriodEnd: null,
    billingInterval: null,
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
