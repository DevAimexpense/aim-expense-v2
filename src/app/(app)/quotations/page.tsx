// ===========================================
// /quotations — Server entry (plan-gated pro+)
//
// Note: Layout (app)/layout.tsx already does session + getOrgContext check.
// React.cache() dedupes within request — but we only need plan check here.
// Page.tsx server work = ~1 prisma query (subscription) ≈ 30-50ms TTFB.
// ===========================================

import { QuotationsClient } from "./quotations-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบเสนอราคา | Aim Expense",
};


export default async function QuotationsPage() {
  await requireFeature("revenueModule");

  return <QuotationsClient />;
}
