// ===========================================
// /reports — Server entry
// Combined Reports page (Overview / By Project / By Vendor)
// Auth check + org context → pass to Client
//
// Note: ReportsClient uses useSearchParams() to sync ?tab=... with state.
// Per Next.js App Router: client components that read searchParams must be
// wrapped in <Suspense> at the Server boundary.
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { ReportsClient } from "./reports-client";

export const metadata = {
  title: "รายงานภาพรวม | Aim Expense",
};

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <ReportsClient orgName={org.orgName} />
    </Suspense>
  );
}
