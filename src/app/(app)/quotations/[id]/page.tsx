// ===========================================
// /quotations/[id] — Server entry (plan-gated)
// (Auth + org check done by layout.tsx — only plan check here)
// ===========================================

import { QuotationDetailClient } from "./quotation-detail-client";
import { requireFeature } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ดูใบเสนอราคา | Aim Expense",
};


export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("revenueModule");

  const { id } = await params;
  return <QuotationDetailClient quotationId={id} />;
}
