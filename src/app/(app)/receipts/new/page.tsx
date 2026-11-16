// ===========================================
// /receipts/new — สร้างใบเสร็จรับเงินโดยตรง (ไม่ต้องมีใบวางบิล)
// ใช้ฟอร์มเดียวกับใบวางบิลในโหมด receipt
// ?replaces=<BillingID> = ออกใหม่แทนใบเสร็จออกตรงที่ยกเลิก (SALE-17b)
// ===========================================

import { NewBillingClient } from "../../billings/new/new-billing-client";
import { ReplaceReceiptClient } from "./replace-receipt-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "สร้างใบเสร็จรับเงิน | Aim Expense",
};

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams?: { replaces?: string };
}) {
  await requireFeature("revenueModule");
  const replaces = typeof searchParams?.replaces === "string" ? searchParams.replaces : "";
  if (replaces) return <ReplaceReceiptClient replacesBillingId={replaces} />;
  return <NewBillingClient mode="create" kind="receipt" />;
}
