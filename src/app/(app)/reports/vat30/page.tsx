// ===========================================
// /reports/vat30 — Server entry (S25B)
// "รายงาน ภ.พ.30" (combined Input + Output VAT — full filing view)
// 3 tabs: ภาษีซื้อ / ภาษีขาย / สรุป (net)
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { Vat30Client } from "./vat30-client";

export const metadata = {
  title: "รายงาน ภ.พ.30 (รวม) | Aim Expense",
};

export default async function Vat30Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <Vat30Client orgName={org.orgName} />
    </Suspense>
  );
}
