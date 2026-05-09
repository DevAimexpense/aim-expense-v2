// ===========================================
// /tax-invoices/[id] — detail page (plan-gated)
// Layout handles auth/org. Plan check lives here.
// ===========================================

import { TaxInvoiceDetailClient } from "./tax-invoice-detail-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบกำกับภาษี | Aim Expense",
};


export default async function TaxInvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireFeature("revenueModule");

  return <TaxInvoiceDetailClient taxInvoiceId={params.id} />;
}
