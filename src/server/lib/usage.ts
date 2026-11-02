// ===========================================
// Per-month usage counter — quota enforcement helper (S26)
// Tracks OCR scans (and future metered metrics) per org per calendar month.
// Used to gate calls in /api/ocr/* + LINE OCR + bonus-OCR consumption.
// เดือนนับตามเวลาไทย (yearMonthBangkok) ให้ตรงกับ "รีเซ็ตทุกเดือน" ที่เว็บบอก
// ===========================================

import { prisma } from "@/lib/prisma";
import {
  PLAN_LIMITS,
  effectivePlan,
  type PlanLimits,
  type SubscriptionState,
} from "@/lib/plans";
import { yearMonthBangkok } from "@/lib/utils/date";

export type UsageMetric = "ocr";

/** Current month as `YYYY-MM` in Asia/Bangkok. */
function currentYearMonth(now = new Date()): string {
  return yearMonthBangkok(now);
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

async function planLimitFor(orgId: string, metric: UsageMetric): Promise<number> {
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { plan: true, trialPlan: true, trialEndsAt: true },
  });
  const plan = effectivePlan(sub as SubscriptionState | null);
  return PLAN_LIMITS[plan][metricToLimit(metric)];
}

/**
 * Atomically check + increment usage. Returns the result of the check.
 * If `ok=false` the increment did NOT happen (caller should refuse the action).
 *
 * Pattern: make sure the row exists → one conditional UPDATE
 * (`count = count + 1 WHERE count < limit`). Postgres row-locks the UPDATE,
 * so N concurrent scans can never push `count` past the limit (the old
 * read-compare-upsert could).
 */
export async function incrementAndCheckQuota(
  orgId: string,
  metric: UsageMetric,
  limitOverride?: number,
): Promise<QuotaCheck> {
  const planLimit = limitOverride ?? (await planLimitFor(orgId, metric));
  const yearMonth = currentYearMonth();
  const key = { orgId_yearMonth_metric: { orgId, yearMonth, metric } };

  // Unlimited — plain increment.
  if (planLimit === -1) {
    const row = await prisma.usageCounter.upsert({
      where: key,
      create: { orgId, yearMonth, metric, count: 1 },
      update: { count: { increment: 1 } },
    });
    return { ok: true, current: row.count, limit: -1, remaining: Infinity, metric };
  }

  // Ensure the month row exists (concurrent first-scans may race on create —
  // the unique violation is harmless, the row is there either way).
  try {
    await prisma.usageCounter.upsert({
      where: key,
      create: { orgId, yearMonth, metric, count: 0 },
      update: {},
    });
  } catch (err) {
    if (!(err && typeof err === "object" && (err as { code?: string }).code === "P2002")) throw err;
  }

  const bumped = await prisma.usageCounter.updateMany({
    where: { orgId, yearMonth, metric, count: { lt: planLimit } },
    data: { count: { increment: 1 } },
  });
  const current = await getUsage(orgId, metric);

  if (bumped.count === 0) {
    return { ok: false, current, limit: planLimit, remaining: 0, metric };
  }
  return {
    ok: true,
    current,
    limit: planLimit,
    remaining: Math.max(0, planLimit - current),
    metric,
  };
}

/** Read-only — does NOT increment. Useful for soft-warning UI. */
export async function checkQuotaOnly(
  orgId: string,
  metric: UsageMetric,
): Promise<QuotaCheck> {
  const limit = await planLimitFor(orgId, metric);
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

function metricToLimit(metric: UsageMetric): keyof PlanLimits {
  switch (metric) {
    case "ocr":
      return "ocrPerMonth";
  }
}
