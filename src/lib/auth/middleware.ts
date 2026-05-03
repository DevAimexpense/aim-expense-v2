// ===========================================
// Aim Expense — Auth Middleware Helpers
// ใช้ใน API routes & Server Components
// ===========================================

import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession, type SessionPayload } from "./session";
import { prisma } from "@/lib/prisma";
import type { Permissions, OrgRole } from "@/types/permissions";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

/**
 * Org context — loaded once per request
 */
export interface OrgContext {
  orgId: string;
  orgName: string;
  role: string;
  permissions: Permissions;
  googleSpreadsheetId: string | null;
  googleDriveFolderId: string | null;
}

/**
 * Require auth — redirect to /login if no session
 * ใช้ใน Server Components
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Get user's org context
 * หา org ที่ user เป็น member (active)
 * ถ้ามีหลาย org → ใช้ตัวแรก (TODO: org switcher)
 *
 * Wrapped in React.cache() — layout.tsx + page.tsx ใน Next.js App Router
 * รันใน same request → without cache จะ query prisma ซ้ำ (~50-100ms × 2).
 * cache() ดึง result เดิมกลับมาใช้ภายใน single request.
 */
export const getOrgContext = cache(async function getOrgContextImpl(
  userId: string,
  activeOrgId?: string | null
): Promise<OrgContext | null> {
  // Find active membership
  // - ถ้ามี activeOrgId → ใช้ที่ user เลือก (multi-org support)
  // - ถ้าไม่มี → ใช้ org แรกที่ user join (backward compat)
  const membership = await prisma.orgMember.findFirst({
    where: {
      userId,
      status: "active",
      ...(activeOrgId ? { orgId: activeOrgId } : {}),
    },
    include: {
      org: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!membership) return null;

  // Get permissions
  const perms = await prisma.userPermission.findUnique({
    where: {
      orgId_userId: {
        orgId: membership.orgId,
        userId,
      },
    },
  });

  // Default `editPaymentAfterApproval` based on role if not explicitly set in DB
  // (admin/manager → true, accountant/staff → false)
  const roleHasEditAfterApproval =
    membership.role === "admin" || membership.role === "manager";

  // S24: Revenue keys are now in Prisma UserPermission — same fallback pattern as legacy keys
  const role = (membership.role || "staff") as OrgRole;
  const roleDefaults = DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.staff;

  const permissions: Permissions = {
    manageEvents: perms?.manageEvents ?? false,
    assignEvents: perms?.assignEvents ?? false,
    managePayees: perms?.managePayees ?? false,
    manageBanks: perms?.manageBanks ?? false,
    updatePayments: perms?.updatePayments ?? false,
    deletePayments: perms?.deletePayments ?? false,
    approvePayments: perms?.approvePayments ?? false,
    // `editPaymentAfterApproval` may not exist in DB yet (new field) → fallback to role default
    editPaymentAfterApproval:
      (perms as Record<string, unknown> | null)?.editPaymentAfterApproval as boolean | undefined ??
      roleHasEditAfterApproval,
    viewReports: perms?.viewReports ?? false,
    printReports: perms?.printReports ?? false,
    dashboardEvent: perms?.dashboardEvent ?? false,
    dashboardSummary: perms?.dashboardSummary ?? false,
    manageUsers: perms?.manageUsers ?? false,
    managePermissions: perms?.managePermissions ?? false,
    // Revenue keys: stored in DB after S24 migration. Existing rows default to FALSE,
    // so for orgs predating the migration we still fall back to role defaults so that
    // admin/manager/accountant don't suddenly lose revenue access.
    manageCustomers: perms?.manageCustomers ?? roleDefaults.manageCustomers,
    manageQuotations: perms?.manageQuotations ?? roleDefaults.manageQuotations,
    manageBillings: perms?.manageBillings ?? roleDefaults.manageBillings,
    manageTaxInvoices:
      perms?.manageTaxInvoices ?? roleDefaults.manageTaxInvoices,
  };

  return {
    orgId: membership.orgId,
    orgName: membership.org.name,
    role: membership.role,
    permissions,
    googleSpreadsheetId: membership.org.googleSpreadsheetId,
    googleDriveFolderId: membership.org.googleDriveFolderId,
  };
});

/**
 * Require auth + org — redirect if missing
 */
export async function requireAuthAndOrg(): Promise<{
  session: SessionPayload;
  org: OrgContext;
}> {
  const session = await requireAuth();
  const org = await getOrgContext(session.userId, session.activeOrgId);

  if (!org) {
    redirect("/select-org"); // multi-org picker (or onboarding if no orgs)
  }

  return { session, org };
}
