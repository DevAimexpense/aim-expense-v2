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
import { GoogleRevokedBanner } from "@/components/shared/google-revoked-banner";

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

  // CO-08: token Google ของเจ้าของถูกยกเลิก → ทุกคนในบริษัทใช้ Sheet ไม่ได้ แจ้งตั้งแต่หน้าแรก
  const orgRow = await prisma.organization.findUnique({ where: { id: org.orgId }, select: { ownerId: true } });
  const ownerConn = orgRow
    ? await prisma.googleConnection.findUnique({ where: { userId: orgRow.ownerId }, select: { isActive: true, googleEmail: true } })
    : null;
  const revoked = !!ownerConn && !ownerConn.isActive;

  return (
    <>
      {revoked && (
        <div style={{ padding: "1rem 1.5rem 0" }}>
          <GoogleRevokedBanner isOwner={orgRow?.ownerId === session.userId} ownerEmail={ownerConn?.googleEmail ?? undefined} />
        </div>
      )}
      <DashboardClient
        orgName={org.orgName}
        userName={session.displayName}
        plan={plan}
        entityType={org.entityType}
      />
    </>
  );
}
