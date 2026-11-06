"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/backoffice", label: "📊 ภาพรวม", exact: true },
  { href: "/backoffice/customers", label: "👥 ลูกค้าทั้งหมด", exact: false },
];

/** แท็บย่อยของหลังบ้าน — ใช้ .app-tabs ของระบบ */
export function BackofficeNav() {
  const pathname = usePathname();
  return (
    <div className="app-tabs" style={{ marginBottom: "1rem" }}>
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`app-tab${active ? " app-tab-active" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
