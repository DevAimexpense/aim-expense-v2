// ===========================================
// Aim Expense — Plan tier single source of truth (S26)
//
// Source: session26/design/SUBSCRIPTION_TIERS.md (locked April 2026)
// All plan-gating, quotas, pricing, and feature flags MUST flow through here.
// Replace ad-hoc `ALLOWED_PLANS` checks with `hasFeature()` / `checkQuota()`.
// ===========================================

// ===== Plan tiers =====

export const PLAN_TIERS = [
  "free",
  "basic",
  "pro",
  "business",
  "max",
  "enterprise",
] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

/** Special tier the trial elevates to. */
export const TRIAL_PLAN: PlanTier = "pro";
export const TRIAL_DURATION_DAYS = 30;

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free Forever",
  basic: "Basic",
  pro: "Pro",
  business: "Business",
  max: "Max",
  enterprise: "Enterprise",
};

// ===== Pricing (THB) =====
// Locked in Aim-Expense-Pricing-Roadmap.xlsx (April 2026).
// Annual saves ~17% (= 2 free months).

export interface PlanPrice {
  monthly: number;
  yearly: number;
}

export const PLAN_PRICING_THB: Partial<Record<PlanTier, PlanPrice>> = {
  basic: { monthly: 189, yearly: 1890 },
  pro: { monthly: 399, yearly: 3990 },
  business: { monthly: 699, yearly: 6990 },
  max: { monthly: 1499, yearly: 14990 },
  // free + enterprise are not on standard checkout (free = $0; enterprise = sales)
};

/** Add-on pricing (one-time or recurring as marked). */
export const ADDON_PRICING_THB = {
  ocrTopup100: 89, // one-time, +100 OCR scans usable for current month
  extraSeat: 49, // recurring per month per extra seat
  customTemplate: 1990, // one-time, custom doc template
} as const;

// ===== Quotas =====
// `-1` = unlimited. UI should render "ไม่จำกัด".

export interface PlanLimits {
  /** Max users (org members). */
  users: number;
  /** Max orgs/businesses per account. */
  businesses: number;
  /** OCR scans per calendar month. */
  ocrPerMonth: number;
  /** LINE group bots that can be wired. */
  lineGroups: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { users: 1, businesses: 1, ocrPerMonth: 5, lineGroups: 0 },
  basic: { users: 2, businesses: 1, ocrPerMonth: 100, lineGroups: 1 },
  pro: { users: 5, businesses: 2, ocrPerMonth: 300, lineGroups: 2 },
  business: { users: 10, businesses: 3, ocrPerMonth: 600, lineGroups: 3 },
  max: { users: 20, businesses: 5, ocrPerMonth: 1500, lineGroups: 5 },
  enterprise: { users: -1, businesses: -1, ocrPerMonth: -1, lineGroups: -1 },
};

/** Trial gets the same limits as `pro` for the 30-day window. */
export const TRIAL_LIMITS: PlanLimits = PLAN_LIMITS.pro;

// ===== Feature flags =====

export type FeatureKey =
  | "approvalFlow"
  | "multiStepApproval"
  | "whtCertificate"
  | "substituteReceipt"
  | "receiptVoucherEsig"
  | "quotation"
  | "billing"
  | "taxInvoice"
  | "revenueModule" // umbrella: quotation | billing | taxInvoice
  | "customBranding"
  | "weeklyReport"
  | "plPerProject"
  | "vat30Report"
  | "vatPurchaseReport"
  | "auditLogExport"
  | "lineOaChat"
  | "lineGroupBot"
  | "gmailScan"
  | "apiAccess";

const FEATURES_BY_TIER: Record<PlanTier, FeatureKey[]> = {
  free: [],
  basic: [
    "approvalFlow",
    "whtCertificate",
    "substituteReceipt",
    "weeklyReport",
    "lineOaChat",
    "lineGroupBot",
  ],
  pro: [
    "approvalFlow",
    "multiStepApproval",
    "whtCertificate",
    "substituteReceipt",
    "receiptVoucherEsig",
    "quotation",
    "billing",
    "taxInvoice",
    "revenueModule",
    "weeklyReport",
    "plPerProject",
    "vat30Report",
    "vatPurchaseReport",
    "lineOaChat",
    "lineGroupBot",
    "gmailScan",
  ],
  business: [
    "approvalFlow",
    "multiStepApproval",
    "whtCertificate",
    "substituteReceipt",
    "receiptVoucherEsig",
    "quotation",
    "billing",
    "taxInvoice",
    "revenueModule",
    "weeklyReport",
    "plPerProject",
    "vat30Report",
    "vatPurchaseReport",
    "lineOaChat",
    "lineGroupBot",
    "gmailScan",
  ],
  max: [
    "approvalFlow",
    "multiStepApproval",
    "whtCertificate",
    "substituteReceipt",
    "receiptVoucherEsig",
    "quotation",
    "billing",
    "taxInvoice",
    "revenueModule",
    "customBranding",
    "weeklyReport",
    "plPerProject",
    "vat30Report",
    "vatPurchaseReport",
    "auditLogExport",
    "lineOaChat",
    "lineGroupBot",
    "gmailScan",
    "apiAccess",
  ],
  enterprise: [
    "approvalFlow",
    "multiStepApproval",
    "whtCertificate",
    "substituteReceipt",
    "receiptVoucherEsig",
    "quotation",
    "billing",
    "taxInvoice",
    "revenueModule",
    "customBranding",
    "weeklyReport",
    "plPerProject",
    "vat30Report",
    "vatPurchaseReport",
    "auditLogExport",
    "lineOaChat",
    "lineGroupBot",
    "gmailScan",
    "apiAccess",
  ],
};

const FEATURE_SETS: Record<PlanTier, Set<FeatureKey>> = Object.fromEntries(
  PLAN_TIERS.map((t) => [t, new Set(FEATURES_BY_TIER[t])]),
) as Record<PlanTier, Set<FeatureKey>>;

// ===== Trial-aware subscription =====

/**
 * Subset of Subscription row that we need to compute effective plan/limits.
 * Pass the result of `prisma.subscription.findUnique({ where: { orgId }})`
 * (or any subset with these fields).
 */
export interface SubscriptionState {
  plan: string | PlanTier;
  trialPlan?: string | PlanTier | null;
  trialEndsAt?: Date | string | null;
}

export function isInTrial(sub: SubscriptionState | null | undefined): boolean {
  if (!sub) return false;
  if (!sub.trialPlan || !sub.trialEndsAt) return false;
  const ends =
    sub.trialEndsAt instanceof Date
      ? sub.trialEndsAt
      : new Date(sub.trialEndsAt);
  return ends.getTime() > Date.now();
}

/**
 * The plan the user actually gets RIGHT NOW.
 * Returns the trial plan if the trial is still active, otherwise the
 * subscribed plan. Falls back to "free".
 */
export function effectivePlan(
  sub: SubscriptionState | null | undefined,
): PlanTier {
  if (isInTrial(sub) && sub?.trialPlan) {
    return normalisePlan(sub.trialPlan);
  }
  if (sub?.plan) return normalisePlan(sub.plan);
  return "free";
}

function normalisePlan(value: string): PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value)
    ? (value as PlanTier)
    : "free";
}

// ===== Helper functions =====

/** Does `plan` include `feature`? */
export function hasFeature(
  plan: PlanTier | string | null | undefined,
  feature: FeatureKey,
): boolean {
  const p = normalisePlan(plan ?? "free");
  return FEATURE_SETS[p].has(feature);
}

/**
 * Check if a usage count is within plan limit.
 * Returns `{ ok: false, limit }` if over, where `limit = -1` means unlimited.
 */
export function checkQuota(
  plan: PlanTier | string | null | undefined,
  metric: keyof PlanLimits,
  current: number,
): { ok: boolean; limit: number; remaining: number } {
  const p = normalisePlan(plan ?? "free");
  const limit = PLAN_LIMITS[p][metric];
  if (limit === -1) {
    return { ok: true, limit: -1, remaining: Infinity };
  }
  return {
    ok: current < limit,
    limit,
    remaining: Math.max(0, limit - current),
  };
}

/**
 * Plans considered "paid" — useful for checks that want to know whether
 * the org is on a revenue tier (excludes free + enterprise's unbilled
 * trials, includes everything in between).
 */
export function isPaidPlan(plan: PlanTier | string | null | undefined): boolean {
  const p = normalisePlan(plan ?? "free");
  return p !== "free";
}

/** Convenience for checkout — list of plans the user can self-serve subscribe to. */
export const SELF_SERVE_PLANS: PlanTier[] = ["basic", "pro", "business", "max"];

// ===== Affiliate / Referral constants =====

/** Discount applied to the first invoice when a valid referral code is used. */
export const REFERRAL_DISCOUNT = {
  /** First-invoice discount percentage. */
  firstInvoicePercentOff: 20,
  /** Bonus OCR scans added to the first month's quota on signup-with-code. */
  bonusOcrFirstMonth: 100,
  /** Stripe coupon ID we'll create in Stripe dashboard. */
  stripeCouponId: "ref-20pct-month1",
} as const;

/**
 * Commission schedule for partner affiliates.
 * Paid AFTER the user has confirmed they're real (= month 2 invoice paid).
 * Capped at 3 months → predictable, anti-churn.
 */
export const AFFILIATE_COMMISSION_SCHEDULE = [
  { monthIndex: 1, percent: 0 }, // hold — wait for month 2 invoice
  { monthIndex: 2, percent: 40 },
  { monthIndex: 3, percent: 25 },
  { monthIndex: 4, percent: 15 },
] as const;

export const AFFILIATE_MIN_PAYOUT_THB = 500;
export const AFFILIATE_PROGRAM_TYPES = [
  "customer_referral", // peer-to-peer mutual: 1 free month, no cash
  "partner_affiliate", // CPA/consultant: cash payout via PromptPay
] as const;
export type AffiliateProgramType = (typeof AFFILIATE_PROGRAM_TYPES)[number];

/**
 * Compute commission amount in THB for a given monthly subscription
 * value at the given month index in the 3-month declining schedule.
 */
export function computeCommission(
  monthlyPriceTHB: number,
  monthIndex: number,
): number {
  const entry = AFFILIATE_COMMISSION_SCHEDULE.find(
    (e) => e.monthIndex === monthIndex,
  );
  if (!entry) return 0;
  return Math.round(monthlyPriceTHB * (entry.percent / 100) * 100) / 100;
}
