// ===========================================
// /receipts — ใบเสร็จรับเงิน (plan-gated เหมือนใบวางบิล)
// ใบเสร็จออกจากใบวางบิลที่รับเงินครบ — หน้านี้รวมรายการที่ออกแล้ว + ที่พร้อมออก
// ===========================================

import { ReceiptsClient } from "./receipts-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบเสร็จรับเงิน | Aim Expense",
};

export default async function ReceiptsPage() {
  await requireFeature("revenueModule");
  return <ReceiptsClient />;
}
