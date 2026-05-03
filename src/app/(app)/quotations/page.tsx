// ===========================================
// /quotations — Server entry (plan-gated pro+)
//
// Note: Layout (app)/layout.tsx already does session + getOrgContext check.
// React.cache() dedupes within request — but we only need plan check here.
// Page.tsx server work = ~1 prisma query (subscription) ≈ 30-50ms TTFB.
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { QuotationsClient } from "./quotations-client";

export const metadata = {
  title: "ใบเสนอราคา | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function QuotationsPage() {
  const session = await getSession();
  if (!session?.activeOrgId) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: { plan: true },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  return <QuotationsClient />;
}
