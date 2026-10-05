// ===========================================
// /receipts/[id]/edit — แก้ไขใบเสร็จรับเงินที่ออกโดยตรง ([id] = BillingID)
// ===========================================

import { EditReceiptClient } from "./edit-receipt-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "แก้ไขใบเสร็จรับเงิน | Aim Expense",
};

export default async function EditReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("revenueModule");
  const { id } = await params;
  return <EditReceiptClient billingId={id} />;
}
