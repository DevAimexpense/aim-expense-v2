// ===========================================
// /receipts/new — สร้างใบเสร็จรับเงินโดยตรง (ไม่ต้องมีใบวางบิล)
// ใช้ฟอร์มเดียวกับใบวางบิลในโหมด receipt
// ===========================================

import { NewBillingClient } from "../../billings/new/new-billing-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "สร้างใบเสร็จรับเงิน | Aim Expense",
};

export default async function NewReceiptPage() {
  await requireFeature("revenueModule");
  return <NewBillingClient mode="create" kind="receipt" />;
}
