// ===========================================
// /tax-invoices — Server entry (plan-gated pro+)
// (Auth + org check done by layout.tsx — only plan check here)
// ===========================================

import { TaxInvoicesClient } from "./tax-invoices-client";
import { requireFeature, requireCompanyOrg } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบกำกับภาษี | Aim Expense",
};


export default async function TaxInvoicesPage() {
  await requireCompanyOrg();
  await requireFeature("revenueModule");

  return <TaxInvoicesClient />;
}
