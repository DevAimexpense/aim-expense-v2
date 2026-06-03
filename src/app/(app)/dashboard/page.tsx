// ===========================================
// Dashboard Page (Server Component shell)
// Loads session/org/subscription → passes to client
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { effectivePlan, type SubscriptionState } from "@/lib/plans";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: org.orgId },
  });

  // Use the EFFECTIVE plan (trial Pro counts as Pro) — not the raw stored plan,
  // otherwise orgs in their Pro trial see free-tier features (revenue/P&L hidden).
  const plan = effectivePlan(subscription as SubscriptionState | null);

  return (
    <DashboardClient
      orgName={org.orgName}
      userName={session.displayName}
      plan={plan}
      entityType={org.entityType}
    />
  );
}
