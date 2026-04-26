// ===========================================
// /reports/expense-summary — Server entry
// Auth check + org context → pass to Client
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { ExpenseSummaryClient } from "./expense-summary-client";

export const metadata = {
  title: "รายงานสรุปค่าใช้จ่าย | Aim Expense",
};

export default async function ExpenseSummaryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return <ExpenseSummaryClient orgName={org.orgName} />;
}
