// ===========================================
// /reports/clearance — Server entry
// "เคลียร์งบ" — reconciliation report for Team Expenses (cash advances)
//
// Auth check + org context → pass to Client
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { ClearanceClient } from "./clearance-client";

export const metadata = {
  title: "เคลียร์งบ | Aim Expense",
};

export default async function ClearancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <ClearanceClient orgName={org.orgName} />
    </Suspense>
  );
}
