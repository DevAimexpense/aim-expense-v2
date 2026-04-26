// ===========================================
// /reports/wht — Server entry
// "รายงานหัก ณ ที่จ่าย" (ภงด.3 + ภงด.53)
//
// ภ.ง.ด.3  = WHT for personal income (บุคคลธรรมดา)
// ภ.ง.ด.53 = WHT for juristic income (นิติบุคคล)
//
// Auth check + org context → pass to Client
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { WhtClient } from "./wht-client";

export const metadata = {
  title: "รายงานหัก ณ ที่จ่าย | Aim Expense",
};

export default async function WhtPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <WhtClient orgName={org.orgName} />
    </Suspense>
  );
}
