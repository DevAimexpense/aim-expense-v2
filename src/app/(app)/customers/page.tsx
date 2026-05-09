// ===========================================
// /customers — Server entry (plan-gated pro+)
// (Auth + org check done by layout.tsx — only plan check here)
// ===========================================

import { CustomersClient } from "./customers-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ลูกค้า | Aim Expense",
};


export default async function CustomersPage() {
  await requireFeature("revenueModule");

  return <CustomersClient />;
}
