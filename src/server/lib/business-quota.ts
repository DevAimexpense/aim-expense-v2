// ===========================================
// Multi-business quota — gate on creating additional businesses (S27)
// The `businesses` limit is per-account: a user may own up to
// PLAN_LIMITS[plan].businesses organizations.
// ===========================================

import { prisma } from "@/lib/prisma";
import {
  PLAN_TIERS,
  checkQuota,
  effectivePlan,
  type PlanTier,
  type SubscriptionState,
} from "@/lib/plans";

export interface BusinessQuotaResult {
  /** `true` if the user may create one more business. */
  ok: boolean;
  /** Businesses the user already owns. */
  current: number;
  /** Plan limit (`-1` = unlimited). */
  limit: number;
  remaining: number;
  /** Highest plan across the user's owned businesses — drives the limit. */
  plan: PlanTier;
}

/**
 * Whether `userId` may create another business (Organization).
 *
 * Each org carries its own subscription, but the `businesses` allowance is an
 * account-level limit. We gate against the HIGHEST plan among the user's owned
 * orgs — so paying for Pro on any one org unlocks Pro's business allowance for
 * the whole account.
 */
export async function checkBusinessQuota(
  userId: string,
): Promise<BusinessQuotaResult> {
  const ownedOrgs = await prisma.organization.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  const current = ownedOrgs.length;

  let plan: PlanTier = "free";
  if (current > 0) {
    const subs = await prisma.subscription.findMany({
      where: { orgId: { in: ownedOrgs.map((o) => o.id) } },
      select: { plan: true, trialPlan: true, trialEndsAt: true },
    });
    for (const sub of subs) {
      const p = effectivePlan(sub as SubscriptionState);
      if (PLAN_TIERS.indexOf(p) > PLAN_TIERS.indexOf(plan)) plan = p;
    }
  }

  const { ok, limit, remaining } = checkQuota(plan, "businesses", current);
  return { ok, current, limit, remaining, plan };
}
