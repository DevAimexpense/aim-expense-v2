// ===========================================
// /credit-notes — ใบลดหนี้ / ใบเพิ่มหนี้ (SALE-02 · ม.86/9-10)
// ===========================================

import { CreditNotesClient } from "./credit-notes-client";
import { requireFeature, requireCompanyOrg } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ใบลดหนี้ / ใบเพิ่มหนี้ | Aim Expense",
};

export default async function CreditNotesPage() {
  await requireFeature("revenueModule");
  await requireCompanyOrg();
  return <CreditNotesClient />;
}
