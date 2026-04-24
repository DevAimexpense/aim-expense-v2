// ===========================================
// Subscription Router — credit usage + plan info
// ===========================================

import { router, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const subscriptionRouter = router({
  /**
   * Get current subscription with credit usage
   */
  current: orgProcedure.query(async ({ ctx }) => {
    const sub = await prisma.subscription.findUnique({
      where: { orgId: ctx.org.orgId },
    });
    if (!sub) return null;

    const totalCredits = sub.scanCredits + sub.bonusCredits;
    const remaining = Math.max(0, totalCredits - sub.creditsUsed);
    const percentage = totalCredits > 0 ? (remaining / totalCredits) * 100 : 0;

    return {
      plan: sub.plan,
      status: sub.status,
      maxMembers: sub.maxMembers,
      maxEvents: sub.maxEvents,
      creditsUsed: sub.creditsUsed,
      scanCredits: sub.scanCredits,
      bonusCredits: sub.bonusCredits,
      totalCredits,
      remainingCredits: remaining,
      percentageRemaining: Math.round(percentage),
      billingPeriodEnd: sub.billingPeriodEnd,
    };
  }),
});
