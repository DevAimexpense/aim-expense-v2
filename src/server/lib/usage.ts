// ===========================================
// Per-month usage counter — quota enforcement helper (S26)
// Tracks OCR scans (and future metered metrics) per org per calendar month.
// Used to gate calls in /api/ocr/* + bonus-OCR consumption.
// ===========================================

import { prisma } from "@/lib/prisma";
import {
  PLAN_LIMITS,
  effectivePlan,
  type PlanLimits,
  type SubscriptionState,
} from "@/lib/plans";

export type UsageMetric = "ocr";

/** Format current month as `YYYY-MM`. */
function currentYearMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface QuotaCheck {
  ok: boolean;
  current: number;
  limit: number;
  remaining: number;
  metric: UsageMetric;
}

/**
 * Read current usage for an org without incrementing.
 * Returns 0 if no row exists.
 */
export async function getUsage(
  orgId: string,
  metric: UsageMetric,
): Promise<number> {
  const row = await prisma.usageCounter.findUnique({
    where: {
      orgId_yearMonth_metric: {
        orgId,
        yearMonth: currentYearMonth(),
        metric,
      },
    },
  });
  return row?.count || 0;
}

/**
 * Atomically check + increment usage. Returns the result of the check.
 * If `ok=false` the increment did NOT happen (caller should refuse the action).
 *
 * Pattern: read → check vs limit → upsert atomic (Postgres ON CONFLICT).
 * No race conditions because Postgres serialises the upsert.
 */
export async function incrementAndCheckQuota(
  orgId: string,
  metric: UsageMetric,
  limitOverride?: number,
): Promise<QuotaCheck> {
  // Look up the org's plan to get the limit
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { plan: true, trialPlan: true, trialEndsAt: true },
  });

  const plan = effectivePlan(sub as SubscriptionState | null);
  const planLimit = limitOverride ?? PLAN_LIMITS[plan][metricToLimit(metric)];

  const current = await getUsage(orgId, metric);

  // Unlimited
  if (planLimit === -1) {
    await bumpCounter(orgId, metric);
    return { ok: true, current: current + 1, limit: -1, remaining: Infinity, metric };
  }

  if (current >= planLimit) {
    return {
      ok: false,
      current,
      limit: planLimit,
      remaining: 0,
      metric,
    };
  }

  await bumpCounter(orgId, metric);
  return {
    ok: true,
    current: current + 1,
    limit: planLimit,
    remaining: Math.max(0, planLimit - current - 1),
    metric,
  };
}

/** Read-only — does NOT increment. Useful for soft-warning UI. */
export async function checkQuotaOnly(
  orgId: string,
  metric: UsageMetric,
): Promise<QuotaCheck> {
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { plan: true, trialPlan: true, trialEndsAt: true },
  });
  const plan = effectivePlan(sub as SubscriptionState | null);
  const limit = PLAN_LIMITS[plan][metricToLimit(metric)];
  const current = await getUsage(orgId, metric);
  if (limit === -1) {
    return { ok: true, current, limit: -1, remaining: Infinity, metric };
  }
  return {
    ok: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
    metric,
  };
}

async function bumpCounter(orgId: string, metric: UsageMetric): Promise<void> {
  const yearMonth = currentYearMonth();
  await prisma.usageCounter.upsert({
    where: {
      orgId_yearMonth_metric: { orgId, yearMonth, metric },
    },
    create: {
      orgId,
      yearMonth,
      metric,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });
}

function metricToLimit(metric: UsageMetric): keyof PlanLimits {
  switch (metric) {
    case "ocr":
      return "ocrPerMonth";
  }
}
