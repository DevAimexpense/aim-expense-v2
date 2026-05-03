// ===========================================
// /quotations — Server entry (plan-gated pro+)
// List of ใบเสนอราคา + create/manage
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { QuotationsClient } from "./quotations-client";

export const metadata = {
  title: "ใบเสนอราคา | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function QuotationsPage() {
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

  return <QuotationsClient />;
}
