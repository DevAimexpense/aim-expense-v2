// ===========================================
// /quotations/[id]/edit — Server entry (plan-gated)
// ===========================================

import { EditQuotationClient } from "./edit-quotation-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "แก้ไขใบเสนอราคา | Aim Expense",
};


export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("revenueModule");

  const { id } = await params;
  return <EditQuotationClient quotationId={id} />;
}
