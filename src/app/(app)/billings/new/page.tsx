// ===========================================
// /billings/new — Server entry (plan-gated)
// ===========================================

import { NewBillingClient } from "./new-billing-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "สร้างใบวางบิล | Aim Expense",
};


export default async function NewBillingPage() {
  await requireFeature("revenueModule");

  return <NewBillingClient mode="create" />;
}
