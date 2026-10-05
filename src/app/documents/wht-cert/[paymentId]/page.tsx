// ===========================================
// หนังสือรับรองการหักภาษี ณ ที่จ่าย (Withholding Tax Certificate)
// ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
//
// ตัวเอกสารคือ PDF (vector) จาก /api/documents/wht-cert/[paymentId]
// หน้านี้เป็นแค่ตัวแสดง + ปุ่มพิมพ์/ดาวน์โหลด/บันทึกลง Drive — **ไม่อ่าน Sheet เอง**
// (เดิมโหลดข้อมูลทั้งที่หน้านี้และที่ API = อ่าน Sheet ซ้ำสองรอบต่อการเปิด 1 ครั้ง)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { WthCertDocument } from "./document";

export default async function WthCertPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { paymentId } = await params;
  return <WthCertDocument paymentId={paymentId} />;
}
