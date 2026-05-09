// ===========================================
// /tax-invoices — Server entry (plan-gated pro+)
// (Auth + org check done by layout.tsx — only plan check here)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { TaxInvoicesClient } from "./tax-invoices-client";

export const metadata = {
  title: "ใบกำกับภาษี | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function TaxInvoicesPage() {
  const session = await getSession();
  if (!session?.activeOrgId) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: { plan: true },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  return <TaxInvoicesClient />;
}
