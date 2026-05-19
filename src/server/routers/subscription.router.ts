// ===========================================
// Subscription Router — plan info + OCR usage
// OCR usage is sourced from the S26 UsageCounter system (per-calendar-month),
// not the legacy scanCredits/creditsUsed columns.
// ===========================================

import { router, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  effectivePlan,
  PLAN_LIMITS,
  type SubscriptionState,
} from "@/lib/plans";
import { getUsage } from "../lib/usage";

export const subscriptionRouter = router({
  /**
   * Current subscription + this month's OCR usage.
   * Field names kept stable (creditsUsed / totalCredits / remainingCredits /
   * percentageRemaining) for existing consumers — values now reflect the
   * UsageCounter system. `totalCredits === -1` means unlimited.
   */
  current: orgProcedure.query(async ({ ctx }) => {
    const sub = await prisma.subscription.findUnique({
      where: { orgId: ctx.org.orgId },
    });
    if (!sub) return null;

    const plan = effectivePlan(sub as SubscriptionState);
    const ocrLimit = PLAN_LIMITS[plan].ocrPerMonth; // -1 = unlimited
    const ocrUsed = await getUsage(ctx.org.orgId, "ocr");
    const unlimited = ocrLimit === -1;
    const remaining = unlimited ? -1 : Math.max(0, ocrLimit - ocrUsed);
    const percentage = unlimited
      ? 100
      : ocrLimit > 0
        ? Math.round((remaining / ocrLimit) * 100)
        : 0;

    return {
      plan,
      status: sub.status,
      maxMembers: sub.maxMembers,
      maxEvents: sub.maxEvents,
      creditsUsed: ocrUsed,
      scanCredits: ocrLimit,
      bonusCredits: 0,
      totalCredits: ocrLimit,
      remainingCredits: remaining,
      percentageRemaining: percentage,
      billingPeriodEnd: sub.billingPeriodEnd,
    };
  }),
});
