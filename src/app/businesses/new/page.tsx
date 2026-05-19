// ===========================================
// /businesses/new — create an additional business (S27 multi-business)
// For already-onboarded users adding another company under their account.
// Gated by the per-account business allowance (PLAN_LIMITS[plan].businesses).
// ===========================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { checkBusinessQuota } from "@/server/lib/business-quota";
import { COMPANY_NAME } from "@/lib/legal/version";
import { NewBusinessForm } from "./new-business-form";

export const metadata: Metadata = {
  title: `สร้างบริษัทใหม่ · ${COMPANY_NAME}`,
};

export default async function NewBusinessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const quota = await checkBusinessQuota(session.userId);

  return <NewBusinessForm quota={quota} />;
}
