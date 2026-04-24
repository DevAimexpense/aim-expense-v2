// ===========================================
// Aim Expense — Permission Types & Constants
// เหมือน Core Event Payment System 100%
// ===========================================

/**
 * 14 Permissions — ตรงตาม Core System
 * + editPaymentAfterApproval: แก้ไขรายการจ่ายหลังถูกอนุมัติ/จ่ายแล้ว (สำหรับผู้มีอำนาจ)
 */
export interface Permissions {
  manageEvents: boolean;
  assignEvents: boolean;
  managePayees: boolean;
  manageBanks: boolean;
  updatePayments: boolean;
  deletePayments: boolean;
  approvePayments: boolean;
  editPaymentAfterApproval: boolean;
  viewReports: boolean;
  printReports: boolean;
  dashboardEvent: boolean;
  dashboardSummary: boolean;
  manageUsers: boolean;
  managePermissions: boolean;
}

/**
 * 4 Roles — ตรงตาม Core System
 */
export type OrgRole = "admin" | "manager" | "accountant" | "staff";

/**
 * Permission key type for type-safe access
 */
export type PermissionKey = keyof Permissions;

/**
 * All 13 permission keys — ใช้สำหรับ iterate
 */
export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "manageEvents",
  "assignEvents",
  "managePayees",
  "manageBanks",
  "updatePayments",
  "deletePayments",
  "approvePayments",
  "editPaymentAfterApproval",
  "viewReports",
  "printReports",
  "dashboardEvent",
  "dashboardSummary",
  "manageUsers",
  "managePermissions",
];

/**
 * Permission labels — สำหรับแสดงผล UI (Thai)
 */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manageEvents: "จัดการกิจกรรม/โปรเจกต์",
  assignEvents: "มอบหมายกิจกรรม",
  managePayees: "จัดการผู้รับเงิน",
  manageBanks: "จัดการบัญชีธนาคาร",
  updatePayments: "แก้ไขรายการจ่าย",
  deletePayments: "ลบรายการจ่าย",
  approvePayments: "อนุมัติรายการจ่าย",
  editPaymentAfterApproval: "แก้ไขรายการจ่ายหลังอนุมัติ",
  viewReports: "ดูรายงาน",
  printReports: "พิมพ์รายงาน",
  dashboardEvent: "Dashboard กิจกรรม",
  dashboardSummary: "Dashboard สรุปรวม",
  manageUsers: "จัดการผู้ใช้",
  managePermissions: "จัดการสิทธิ์",
};

/**
 * Permission groups — สำหรับจัดหมวดหมู่ใน UI
 */
export const PERMISSION_GROUPS = {
  events: {
    label: "กิจกรรม / โปรเจกต์",
    permissions: ["manageEvents", "assignEvents"] as PermissionKey[],
  },
  masterData: {
    label: "ข้อมูลหลัก",
    permissions: ["managePayees", "manageBanks"] as PermissionKey[],
  },
  payments: {
    label: "รายการจ่าย",
    permissions: [
      "updatePayments",
      "deletePayments",
      "approvePayments",
      "editPaymentAfterApproval",
    ] as PermissionKey[],
  },
  reports: {
    label: "รายงาน & Dashboard",
    permissions: [
      "viewReports",
      "printReports",
      "dashboardEvent",
      "dashboardSummary",
    ] as PermissionKey[],
  },
  admin: {
    label: "บริหารจัดการ",
    permissions: ["manageUsers", "managePermissions"] as PermissionKey[],
  },
} as const;
