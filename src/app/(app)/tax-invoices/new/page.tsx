// ===========================================
// /tax-invoices/new — Server entry (plan-gated)
//
// Supports `?fromBilling=BIL-xxx` and `?fromQuotation=QT-xxx` for
// convert-flows: server-side calls the appropriate convert procedure
// and redirects to the new draft TI's detail page.
// ===========================================

import { NewTaxInvoiceClient } from "./new-tax-invoice-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "สร้างใบกำกับภาษี | Aim Expense",
};


interface PageProps {
  searchParams: { fromBilling?: string; fromQuotation?: string };
}

export default async function NewTaxInvoicePage({ searchParams }: PageProps) {
  await requireFeature("revenueModule");

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
