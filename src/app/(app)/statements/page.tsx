// ===========================================
// /statements — Statement ธนาคารรายเดือน (ส่งสำนักงานบัญชี)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { StatementsClient } from "./statements-client";

export const metadata = {
  title: "Statement ธนาคาร | Aim Expense",
};

export default async function StatementsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");
  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");
  if (org.role !== "admin" && !org.permissions.viewReports) redirect("/dashboard");

  return <StatementsClient isAdmin={org.role === "admin"} userId={session.userId} />;
}
