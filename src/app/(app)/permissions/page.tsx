// ===========================================
// /permissions — Server entry
//
// Per-key permission editor for org members. /users page handles
// role + eventScope + invite/remove (high-level) — this page handles
// the granular 14-key overrides (PERMISSION_GROUPS structure).
//
// Permission required: managePermissions
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { PermissionsClient } from "./permissions-client";

export const metadata = {
  title: "จัดการสิทธิ์ | Aim Expense",
};

export default async function PermissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  // Server-side gate (UI is filtered too, but this is the source of truth)
  if (!org.permissions.managePermissions) redirect("/dashboard");

  return <PermissionsClient orgName={org.orgName} />;
}
