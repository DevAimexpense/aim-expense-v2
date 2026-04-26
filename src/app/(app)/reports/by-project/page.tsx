// ===========================================
// /reports/by-project — Server entry
// Auth check + org context → pass to Client
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { ByProjectClient } from "./by-project-client";

export const metadata = {
  title: "รายงานแยกโปรเจกต์ | Aim Expense",
};

export default async function ByProjectPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  return <ByProjectClient orgName={org.orgName} />;
}
