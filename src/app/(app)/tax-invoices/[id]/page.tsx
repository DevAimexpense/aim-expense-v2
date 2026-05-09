// ===========================================
// /tax-invoices/[id] — detail page (plan-gated)
// Layout handles auth/org. Plan check lives here.
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { TaxInvoiceDetailClient } from "./tax-invoice-detail-client";

export const metadata = {
  title: "ใบกำกับภาษี | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function TaxInvoiceDetailPage({
  params,
}: {
  params: { id: string };
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

  return <TaxInvoiceDetailClient taxInvoiceId={params.id} />;
}
