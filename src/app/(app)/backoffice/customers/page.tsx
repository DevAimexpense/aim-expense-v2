// ===========================================
// /backoffice/customers — ลูกค้าทั้งหมด + ให้สิทธิ์ใช้ฟรี
// ประตูเข้าอยู่ที่ ../layout.tsx
// ===========================================

import { Suspense } from "react";
import { CustomersClient } from "./customers-client";

export const metadata = {
  title: "ลูกค้าทั้งหมด | Aim Expense",
};

export default function BackofficeCustomersPage() {
  return (
    <>
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">👥 ลูกค้าทั้งหมด</h1>
          <p className="app-page-subtitle">
            กดชื่อบริษัทเพื่อดูรายละเอียด · กำหนดแพ็กเกจ: วางบิล/โอน · ฟรีชั่วคราว 1 / 2 / 3 เดือน · ฟรีตลอดชีพ
          </p>
        </div>
      </div>
      {/* useSearchParams (?filter=) ต้องอยู่ใต้ Suspense ตามกติกา Next 14 */}
      <Suspense fallback={<div style={{ padding: "2rem", color: "#64748b" }}>กำลังโหลด…</div>}>
        <CustomersClient />
      </Suspense>
    </>
  );
}
