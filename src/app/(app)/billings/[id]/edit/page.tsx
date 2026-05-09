// ===========================================
// /billings/[id]/edit — Server entry (plan-gated)
// ===========================================

import { EditBillingClient } from "./edit-billing-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "แก้ไขใบวางบิล | Aim Expense",
};


export default async function EditBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("revenueModule");

  const { id } = await params;
  return <EditBillingClient billingId={id} />;
}
