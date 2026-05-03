// ===========================================
// /billings/[id] — Server entry (plan-gated)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { BillingDetailClient } from "./billing-detail-client";

export const metadata = {
  title: "ดูใบวางบิล | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function BillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.activeOrgId) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: { plan: true },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  const { id } = await params;
  return <BillingDetailClient billingId={id} />;
}
