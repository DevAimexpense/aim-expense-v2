// ===========================================
// /billings — Server entry (plan-gated pro+)
// (Auth + org check done by layout.tsx — only plan check here)
// ===========================================

import { BillingsClient } from "./billings-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบวางบิล | Aim Expense",
};


export default async function BillingsPage() {
  await requireFeature("revenueModule");

  return <BillingsClient />;
}
