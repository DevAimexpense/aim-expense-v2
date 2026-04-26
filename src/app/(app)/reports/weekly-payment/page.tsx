// ===========================================
// /reports/weekly-payment — Server entry
// "ชำระรายสัปดาห์" — bank batch planner for approved payments
//
// Auth check + org context → pass to Client
// ===========================================

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { WeeklyPaymentClient } from "./weekly-payment-client";

export const metadata = {
  title: "ชำระรายสัปดาห์ | Aim Expense",
};

export default async function WeeklyPaymentPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return (
    <Suspense fallback={<div className="app-page">กำลังโหลดรายงาน…</div>}>
      <WeeklyPaymentClient orgName={org.orgName} />
    </Suspense>
  );
}
