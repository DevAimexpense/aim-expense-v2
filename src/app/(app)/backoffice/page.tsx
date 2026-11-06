// ===========================================
// /backoffice — ภาพรวมลูกค้า (จ่ายจริง / ทดลอง / ตลอดชีพ / ฟรี · ใกล้หมดอายุ · กดยกเลิก)
// ประตูเข้าอยู่ที่ layout.tsx · ข้อมูลจาก Postgres เท่านั้น
// ===========================================

import { OverviewClient } from "./overview-client";

export const metadata = {
  title: "ภาพรวมลูกค้า | Aim Expense",
};

export default function BackofficeOverviewPage() {
  return (
    <>
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📊 ภาพรวมลูกค้า</h1>
          <p className="app-page-subtitle">
            ลูกค้าทุกบริษัทในระบบ (ไม่นับบริษัทของทีมงาน) · อัปเดตจากฐานข้อมูลทุกครั้งที่เปิด
          </p>
        </div>
      </div>
      <OverviewClient />
    </>
  );
}
