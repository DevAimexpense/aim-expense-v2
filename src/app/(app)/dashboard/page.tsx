// ===========================================
// Dashboard Page (Server Component shell)
// Loads session/org/subscription → passes to client
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./dashboard-client";
import { GoogleRevokedBanner } from "@/components/shared/google-revoked-banner";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  // BIL-35/CO-31: EFFECTIVE plan (trial Pro counts as Pro) — โหลดไว้แล้วใน getOrgContext
  // ไม่ query Subscription ซ้ำที่นี่
  const plan = org.plan;

  // CO-08: token Google ของเจ้าของถูกยกเลิก → ทุกคนในบริษัทใช้ Sheet ไม่ได้ แจ้งตั้งแต่หน้าแรก
  // (query เดียว: org → owner → googleConnection)
  const orgRow = await prisma.organization.findUnique({
    where: { id: org.orgId },
    select: {
      ownerId: true,
      owner: { select: { googleConnection: { select: { isActive: true, googleEmail: true } } } },
    },
  });
  const ownerConn = orgRow?.owner.googleConnection ?? null;
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
