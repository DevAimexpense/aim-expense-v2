// ===========================================
// /tax-invoices/[id]/edit — Server entry (plan-gated)
// ===========================================

import { EditTaxInvoiceClient } from "./edit-tax-invoice-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "แก้ไขใบกำกับภาษี | Aim Expense",
};


export default async function EditTaxInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  await requireFeature("revenueModule");

  return <EditTaxInvoiceClient taxInvoiceId={params.id} />;
}
