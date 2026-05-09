// ===========================================
// /tax-invoices/new — Server entry (plan-gated)
//
// Supports `?fromBilling=BIL-xxx` and `?fromQuotation=QT-xxx` for
// convert-flows: server-side calls the appropriate convert procedure
// and redirects to the new draft TI's detail page.
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { NewTaxInvoiceClient } from "./new-tax-invoice-client";

export const metadata = {
  title: "สร้างใบกำกับภาษี | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

interface PageProps {
  searchParams: { fromBilling?: string; fromQuotation?: string };
}

export default async function NewTaxInvoicePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.activeOrgId) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: { plan: true },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  // Convert flow is delegated to the client (uses tRPC mutation +
  // redirect via router.push). The server entry just gates auth/plan.
  const fromBilling = searchParams?.fromBilling || null;
  const fromQuotation = searchParams?.fromQuotation || null;

  return (
    <NewTaxInvoiceClient
      mode="create"
      fromBilling={fromBilling}
      fromQuotation={fromQuotation}
    />
  );
}
