// ===========================================
// /tax-invoices/[id]/edit — Server entry (plan-gated)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { EditTaxInvoiceClient } from "./edit-tax-invoice-client";

export const metadata = {
  title: "แก้ไขใบกำกับภาษี | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function EditTaxInvoicePage({
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

  return <EditTaxInvoiceClient taxInvoiceId={params.id} />;
}
