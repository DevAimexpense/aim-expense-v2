// ===========================================
// /quotations/[id] — Server entry (plan-gated)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { QuotationDetailClient } from "./quotation-detail-client";

export const metadata = {
  title: "ดูใบเสนอราคา | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: org.orgId },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  const { id } = await params;
  return <QuotationDetailClient quotationId={id} />;
}
