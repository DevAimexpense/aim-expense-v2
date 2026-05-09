// ===========================================
// /quotations/new — Server entry (plan-gated)
// ===========================================

import { NewQuotationClient } from "./new-quotation-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "สร้างใบเสนอราคา | Aim Expense",
};


export default async function NewQuotationPage() {
  await requireFeature("revenueModule");

  return <NewQuotationClient mode="create" />;
}
