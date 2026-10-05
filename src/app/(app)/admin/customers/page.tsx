// ===========================================
// /admin/customers — หลังบ้านทีมงาน: จัดการลูกค้า + ให้สิทธิ์ใช้ฟรี
// เข้าได้เฉพาะ admin ของบริษัทหลังบ้าน (org ที่ settings.backoffice = true)
// และต้องกำลังเลือกบริษัทนั้นอยู่ · คนอื่นเจอ notFound() (ไม่เปิดเผยว่ามีหน้านี้)
// ===========================================

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { CustomersClient } from "./customers-client";

export const metadata = {
  title: "จัดการลูกค้า | Aim Expense",
};

export default async function AdminCustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org || !org.isBackoffice || org.role !== "admin") notFound();

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">👥 จัดการลูกค้า</h1>
          <p className="app-page-subtitle">
            ลูกค้าทุกบริษัทในระบบ · ให้สิทธิ์ใช้ฟรี 1 / 2 / 3 เดือน หรือฟรีตลอดชีพ
          </p>
        </div>
      </div>
      <CustomersClient />
    </div>
  );
}
