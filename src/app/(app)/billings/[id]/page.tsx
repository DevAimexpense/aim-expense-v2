// ===========================================
// /billings/[id] — Server entry (plan-gated)
// ===========================================

import { BillingDetailClient } from "./billing-detail-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ดูใบวางบิล | Aim Expense",
};


export default async function BillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("revenueModule");

  const { id } = await params;
  return <BillingDetailClient billingId={id} />;
}
