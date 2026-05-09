"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permissions, PermissionKey } from "@/types/permissions";

// ===== Navigation Structure (All Thai) =====
interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: PermissionKey | PermissionKey[];
  adminOnly?: boolean; // แสดงเฉพาะ role=admin (สำหรับเมนู settings/billing/google)
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [
      {
        label: "แดชบอร์ด",
        href: "/dashboard",
        icon: "📊",
      },
    ],
  },
  {
    label: "โปรเจกต์",
    items: [
      {
        label: "จัดการโปรเจกต์",
        href: "/events",
        icon: "📋",
        permission: "manageEvents",
      },
    ],
  },
  {
    label: "รายจ่าย",
    items: [
      {
        label: "ตั้งเบิก",
        href: "/payments",
        icon: "💸",
        permission: "updatePayments",
      },
      {
        label: "บันทึกค่าใช้จ่าย",
        href: "/expenses",
        icon: "🧾",
      },
      {
        label: "อนุมัติรายการ",
        href: "/approvals",
        icon: "✅",
        permission: "approvePayments",
      },
      {
        label: "เตรียมการจ่าย",
        href: "/payment-prep",
        icon: "💰",
        permission: "approvePayments",
      },
      {
        label: "เคลียร์งบ",
        href: "/reports/clearance",
        icon: "📑",
        permission: "viewReports",
      },
      {
        label: "เอกสาร / ใบเสร็จ",
        href: "/documents",
        icon: "📄",
      },
    ],
  },
  {
    label: "รายได้",
    items: [
      {
        label: "ใบเสนอราคา",
        href: "/quotations",
        icon: "📜",
        permission: "manageQuotations",
      },
      {
        label: "ใบวางบิล",
        href: "/billings",
        icon: "🧾",
        permission: "manageBillings",
      },
      {
        label: "ใบกำกับภาษี",
        href: "/tax-invoices",
        icon: "🧮",
        permission: "manageTaxInvoices",
      },
    ],
  },
  {
    label: "ข้อมูลหลัก",
    items: [
      {
        label: "ผู้รับเงิน",
        href: "/payees",
        icon: "👤",
        permission: "managePayees",
      },
      {
        label: "ลูกค้า",
        href: "/customers",
        icon: "🏢",
        permission: "manageCustomers",
      },
      {
        label: "รายชื่อธนาคาร",
        href: "/banks",
        icon: "🏦",
        permission: "manageBanks",
      },
    ],
  },
  {
    label: "รายงาน",
    items: [
      {
        label: "ภาพรวมรายจ่าย",
        href: "/reports",
        icon: "📊",
        permission: "viewReports",
      },
      {
        label: "รายงาน ภ.พ.30 (รวม)",
        href: "/reports/vat30",
        icon: "📈",
        permission: "viewReports",
      },
      {
        label: "รายงานภาษีซื้อ (ภ.พ.30)",
        href: "/reports/vat",
        icon: "🛒",
        permission: "viewReports",
      },
      {
        label: "รายงาน ภงด.3",
        href: "/reports/wht?tab=pnd3",
        icon: "📊",
        permission: "viewReports",
      },
      {
        label: "รายงาน ภงด.53",
        href: "/reports/wht?tab=pnd53",
        icon: "📊",
        permission: "viewReports",
      },
    ],
  },
  {
    label: "บริหารจัดการ",
    items: [
      {
        label: "จัดการผู้ใช้",
        href: "/users",
        icon: "👥",
        permission: "manageUsers",
      },
      {
        label: "จัดการสิทธิ์",
        href: "/permissions",
        icon: "🔐",
        permission: "managePermissions",
      },
      {
        label: "ตั้งค่าองค์กร",
        href: "/settings/org",
        icon: "⚙️",
        adminOnly: true,
      },
      {
        label: "แพ็คเกจ",
        href: "/settings/billing",
        icon: "💳",
        adminOnly: true,
      },
      {
        label: "เชื่อมต่อ Google",
        href: "/settings/google",
        icon: "🔗",
        adminOnly: true,
      },
      {
        label: "เปลี่ยนบริษัท",
        href: "/select-org",
        icon: "🔄",
      },
    ],
  },
];

interface SidebarProps {
  permissions: Permissions | null;
  orgName?: string;
  userName?: string;
  userAvatar?: string;
  isAdmin?: boolean;
}

export function Sidebar({
  permissions,
  orgName = "Aim Expense",
  userName = "",
  userAvatar,
  isAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  function isVisible(item: NavItem): boolean {
    // adminOnly: ซ่อนเมนูถ้าไม่ใช่ admin (settings องค์กร, billing, google)
    if (item.adminOnly && !isAdmin) return false;
    if (!item.permission) return true;
    if (isAdmin) return true;
    if (!permissions) return false;
    if (Array.isArray(item.permission)) {
      return item.permission.some((p) => permissions[p]);
    }
    return permissions[item.permission];
  }

  function isGroupVisible(group: NavGroup): boolean {
    return group.items.some(isVisible);
  }

  return (
    <aside className={isCollapsed ? "sidebar sidebar-collapsed" : "sidebar"}>
      {/* Header */}
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="sidebar-brand">
            <div className="sidebar-logo">A</div>
            <div className="sidebar-org" title={orgName}>
              {orgName}
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sidebar-toggle"
          title={isCollapsed ? "ขยาย" : "ย่อ"}
          aria-label="toggle sidebar"
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_GROUPS.filter(isGroupVisible).map((group) => (
          <div key={group.label} className="sidebar-group">
            {!isCollapsed && <p className="sidebar-group-label">{group.label}</p>}
            {group.items.filter(isVisible).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className={isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {!isCollapsed && <span className="sidebar-link-label">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatar} alt="" />
            ) : (
              userName?.charAt(0)?.toUpperCase() || "U"
            )}
          </div>
          {!isCollapsed && (
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{userName || "User"}</p>
              <p className="sidebar-user-role">
                {isAdmin ? "ผู้ดูแล" : "สมาชิก"}
              </p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="sidebar-logout">
              ออกจากระบบ
            </button>
          </form>
        )}
        {!isCollapsed && (
          <div className="sidebar-legal">
            <Link href="/account/data" className="sidebar-legal-link">
              ข้อมูลส่วนบุคคล
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="sidebar-legal-link" target="_blank" rel="noopener">
              ความเป็นส่วนตัว
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="sidebar-legal-link" target="_blank" rel="noopener">
              ข้อกำหนด
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
