// ===========================================
// /quotations/[id]/edit — Server entry (plan-gated)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { EditQuotationClient } from "./edit-quotation-client";

export const metadata = {
  title: "แก้ไขใบเสนอราคา | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function EditQuotationPage({
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
  return <EditQuotationClient quotationId={id} />;
}
