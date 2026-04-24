// ===========================================
// Aim Expense — Default Permission Sets
// ตรงตาม Core Event Payment System
// ===========================================

import type { Permissions, OrgRole } from "@/types/permissions";

/**
 * Full access — all 13 permissions = true
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
};

/**
 * No access — all 14 permissions = false
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
  },
};

/**
 * Get default permissions for a role
 */
export function getDefaultPermissions(role: OrgRole): Permissions {
  return { ...DEFAULT_PERMISSIONS[role] };
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
