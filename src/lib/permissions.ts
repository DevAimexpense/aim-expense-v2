// ===========================================
// Aim Expense — Default Permission Sets
// ตรงตาม Core Event Payment System
// ===========================================

import type { Permissions, OrgRole } from "@/types/permissions";

/**
 * Full access — all 18 permissions = true
 */
const ALL_TRUE: Permissions = {
  manageEvents: true,
  assignEvents: true,
  managePayees: true,
  manageBanks: true,
  updatePayments: true,
  deletePayments: true,
  approvePayments: true,
  editPaymentAfterApproval: true,
  viewReports: true,
  printReports: true,
  dashboardEvent: true,
  dashboardSummary: true,
  manageUsers: true,
  managePermissions: true,
  manageCustomers: true,
  manageQuotations: true,
  manageBillings: true,
  manageTaxInvoices: true,
};

/**
 * No access — all 18 permissions = false
 */
const ALL_FALSE: Permissions = {
  manageEvents: false,
  assignEvents: false,
  managePayees: false,
  manageBanks: false,
  updatePayments: false,
  deletePayments: false,
  approvePayments: false,
  editPaymentAfterApproval: false,
  viewReports: false,
  printReports: false,
  dashboardEvent: false,
  dashboardSummary: false,
  manageUsers: false,
  managePermissions: false,
  manageCustomers: false,
  manageQuotations: false,
  manageBillings: false,
  manageTaxInvoices: false,
};

/**
 * Default permissions per role — ตรงตาม Core System
 *
 * admin     → ทุกอย่าง
 * manager   → จัดการทั่วไป + อนุมัติ + รายงาน (ไม่มี manage users/permissions)
 * accountant → จ่ายเงิน + รายงาน + dashboard สรุป
 * staff     → ดูข้อมูลพื้นฐาน + dashboard กิจกรรม
 */
export const DEFAULT_PERMISSIONS: Record<OrgRole, Permissions> = {
  admin: { ...ALL_TRUE },

  manager: {
    manageEvents: true,
    assignEvents: true,
    managePayees: true,
    manageBanks: true,
    updatePayments: true,
    deletePayments: true,
    approvePayments: true,
    editPaymentAfterApproval: true,
    viewReports: true,
    printReports: true,
    dashboardEvent: true,
    dashboardSummary: true,
    manageUsers: false,
    managePermissions: false,
    manageCustomers: true,
    manageQuotations: true,
    manageBillings: true,
    manageTaxInvoices: false,
  },

  accountant: {
    manageEvents: false,
    assignEvents: false,
    managePayees: true,
    manageBanks: true,
    updatePayments: true,
    deletePayments: false,
    approvePayments: false,
    editPaymentAfterApproval: false,
    viewReports: true,
    printReports: true,
    dashboardEvent: false,
    dashboardSummary: true,
    manageUsers: false,
    managePermissions: false,
    manageCustomers: true,
    manageQuotations: true,
    manageBillings: true,
    manageTaxInvoices: true,
  },

  staff: {
    manageEvents: false,
    assignEvents: false,
    managePayees: false,
    manageBanks: false,
    updatePayments: false,
    deletePayments: false,
    approvePayments: false,
    editPaymentAfterApproval: false,
    viewReports: false,
    printReports: false,
    dashboardEvent: true,
    dashboardSummary: false,
    manageUsers: false,
    managePermissions: false,
    manageCustomers: false,
    manageQuotations: false,
    manageBillings: false,
    manageTaxInvoices: false,
  },

  // Project Manager — sees totals/reports/dashboard for assigned projects only
  // (scoping enforced server-side via eventScope). Cannot manage projects or
  // system settings.
  //
  // Phase 2: PM can record (ตั้งเบิก) and edit/delete payments, but ONLY for
  // team expenses inside their assigned events. updatePayments/deletePayments
  // are enabled here as the *capability* gate; the per-row scope+expenseType
  // restriction is enforced in payment.router (see assertPmWriteScope) so PM
  // can never touch payments outside their projects or non-team expenses.
  project_manager: {
    manageEvents: false,
    assignEvents: false,
    managePayees: false,
    manageBanks: false,
    updatePayments: true,
    deletePayments: true,
    approvePayments: false,
    editPaymentAfterApproval: false,
    viewReports: true,
    printReports: true,
    dashboardEvent: true,
    dashboardSummary: true,
    manageUsers: false,
    managePermissions: false,
    manageCustomers: false,
    manageQuotations: false,
    manageBillings: false,
    manageTaxInvoices: false,
  },
};

/**
 * Get default permissions for a role
 */
export function getDefaultPermissions(role: OrgRole): Permissions {
  return { ...DEFAULT_PERMISSIONS[role] };
}

/**
 * Event-scoping for project-scoped roles.
 * Returns the list of EventIDs the user is restricted to, or `null` when the
 * role sees everything (admin/manager/accountant/staff). An empty array means
 * "assigned to nothing" → sees nothing.
 */
export function scopedEventIds(
  org: { role: string; eventScope: string[] } | null | undefined,
): string[] | null {
  if (!org) return null;
  return org.role === "project_manager" ? org.eventScope : null;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  permissions: Permissions | null | undefined,
  key: keyof Permissions
): boolean {
  if (!permissions) return false;
  return permissions[key] === true;
}

/**
 * Check if user has ANY of the given permissions
 */
export function hasAnyPermission(
  permissions: Permissions | null | undefined,
  keys: (keyof Permissions)[]
): boolean {
  if (!permissions) return false;
  return keys.some((key) => permissions[key] === true);
}

/**
 * Check if user has ALL of the given permissions
 */
export function hasAllPermissions(
  permissions: Permissions | null | undefined,
  keys: (keyof Permissions)[]
): boolean {
  if (!permissions) return false;
  return keys.every((key) => permissions[key] === true);
}

/**
 * Merge custom permissions over default role permissions
 */
export function mergePermissions(
  base: Permissions,
  overrides: Partial<Permissions>
): Permissions {
  return { ...base, ...overrides };
}
