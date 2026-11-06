// ===========================================
// /backoffice — หลังบ้านทีมงาน Aim Expense (จัดการลูกค้าข้ามบริษัท)
//
// ประตูเข้า: เป็น admin ของ "บริษัทหลังบ้าน" (settings.backoffice = true)
// ไม่ว่าจะกำลังเลือกบริษัทไหนอยู่ (lib/auth/backoffice.ts — กฎเดียวกับ backofficeProcedure)
// คนอื่นเจอ notFound() เพื่อไม่เปิดเผยว่ามีหน้านี้
// ===========================================

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isBackofficeAdmin } from "@/lib/auth/backoffice";
import { BackofficeNav } from "./backoffice-nav";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await isBackofficeAdmin(session.userId))) notFound();

  return (
    <div className="app-page">
      <BackofficeNav />
      {children}
    </div>
  );
}
