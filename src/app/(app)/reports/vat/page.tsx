// ===========================================
// /reports/vat — Server entry
// "รายงานภาษีซื้อ" (Purchase VAT — used as ภ.พ.30 input-VAT attachment)
//
// ภ.พ.30 has two halves:
//   (a) ภาษีขาย (Output VAT) — captured by future sales/quotation module
//   (b) ภาษีซื้อ (Input VAT) — this report
//
// Auth check + org context → pass to Client. No plan-gate yet (matches /reports/wht).
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { VatClient } from "./vat-client";

export const metadata = {
  title: "รายงานภาษีซื้อ | Aim Expense",
};

export default async function VatPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <VatClient orgName={org.orgName} />
    </Suspense>
  );
}
