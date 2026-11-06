// ===========================================
// /admin/customers — ย้ายไป /backoffice/customers แล้ว (S36)
// คง route เดิมไว้เป็น redirect ให้ลิงก์/บุ๊กมาร์กเก่าของทีมงานยังใช้ได้
// ประตูเข้าอยู่ที่ (app)/backoffice/layout.tsx
// ===========================================

import { redirect } from "next/navigation";

export default function AdminCustomersRedirect() {
  redirect("/backoffice/customers");
}
