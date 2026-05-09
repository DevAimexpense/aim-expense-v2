// ===========================================
// Server-side plan/feature guard for App Router pages.
// Replaces inline `ALLOWED_PLANS = [...]` checks with a single call.
//
// Usage in a page.tsx server component:
//
//   const { plan } = await requireFeature("revenueModule");
//   return <Client plan={plan} />;
//
// Auto-handles: auth check → org check → trial → plan → redirect with reason.
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  effectivePlan,
  hasFeature,
  isInTrial,
  type FeatureKey,
  type PlanTier,
  type SubscriptionState,
} from "@/lib/plans";

interface RequireFeatureResult {
  plan: PlanTier;
  inTrial: boolean;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  orgId: string;
}

/**
 * Server-side guard. Redirects to login / select-org / upgrade as needed,
 * otherwise returns the active session + effective plan.
 */
export async function requireFeature(
  feature: FeatureKey,
  options: { upgradePath?: string } = {},
): Promise<RequireFeatureResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeOrgId) redirect("/");

  const sub = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: {
      plan: true,
      trialPlan: true,
      trialEndsAt: true,
    },
  });

  const plan = effectivePlan(sub as SubscriptionState | null);
  if (!hasFeature(plan, feature)) {
    const target = options.upgradePath || "/dashboard";
    redirect(`${target}?upgrade=${encodeURIComponent(feature)}`);
  }

  return {
    session,
    orgId: session.activeOrgId,
    plan,
    inTrial: isInTrial(sub as SubscriptionState | null),
  };
}

/**
 * Soft check — returns plan + flags without redirecting.
 * Use in components that want to show degraded UI rather than hard-redirect.
 */
export async function getEffectivePlan(orgId: string | null | undefined) {
  if (!orgId) return { plan: "free" as PlanTier, inTrial: false };
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { plan: true, trialPlan: true, trialEndsAt: true },
  });
  return {
    plan: effectivePlan(sub as SubscriptionState | null),
    inTrial: isInTrial(sub as SubscriptionState | null),
  };
}
