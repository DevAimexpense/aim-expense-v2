// ===========================================
// /businesses/new — create an additional business (S27 multi-business)
// For already-onboarded users adding another company under their account.
// Gated by the per-account business allowance (PLAN_LIMITS[plan].businesses).
// ===========================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { checkBusinessQuota } from "@/server/lib/business-quota";
import { prisma } from "@/lib/prisma";
import { COMPANY_NAME } from "@/lib/legal/version";
import { NewBusinessForm } from "./new-business-form";

export const metadata: Metadata = {
  title: `สร้างบริษัทใหม่ · ${COMPANY_NAME}`,
};

export default async function NewBusinessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const quota = await checkBusinessQuota(session.userId);

  // Creating a workspace writes a master sheet to the user's OWN Google Drive,
  // so they need their own Google connection. Invited staff skip Google during
  // onboarding → may have none. Gate the form so they get a clear "connect
  // Google" CTA instead of a cryptic token error on submit.
  const googleConn = await prisma.googleConnection.findUnique({
    where: { userId: session.userId },
    select: { isActive: true },
  });
  const googleConnected = !!googleConn?.isActive;

  return <NewBusinessForm quota={quota} googleConnected={googleConnected} />;
}
