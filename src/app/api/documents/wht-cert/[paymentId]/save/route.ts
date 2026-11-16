// ===========================================
// POST /api/documents/wht-cert/[paymentId]/save
// บันทึก 50 ทวิ ลง Drive จากฝั่ง server (แทน hidden iframe เดิม) — ใช้โดย fireAutoGenDoc("wht-cert")
// และผลลัพธ์เดียวกับ auto-save หลัง mutation (lock ต่อรายการ + อ่านสด → ไม่สร้างไฟล์ซ้ำ)
// ===========================================

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { isPaymentInScope } from "@/server/lib/wht-cert-data";
import { autoSaveWhtCert } from "@/server/lib/wht-cert-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_DATE_MESSAGE =
  "ยังบันทึกหนังสือรับรองหัก ณ ที่จ่ายไม่ได้ — รายการนี้ยังไม่มีวันที่จ่ายเงินหรือวันที่ตามใบเสร็จ (ระบบจะบันทึกให้อัตโนมัติเมื่อบันทึกจ่ายเงิน)";

// WHT-02: ข้อความตรงกับเหตุที่ข้ามจริง
const SKIP_MESSAGE: Record<"no_wht" | "not_paid" | "no_date" | "not_found" | "other_doc", string> = {
  no_wht: "ไม่มีหัก ณ ที่จ่ายในรายการนี้",
  not_paid: "รายการนี้ยังไม่ได้จ่ายเงิน — ระบบจะบันทึกหนังสือรับรองหัก ณ ที่จ่ายลง Drive ให้อัตโนมัติเมื่อบันทึกจ่ายเงินแล้ว",
  no_date: NO_DATE_MESSAGE,
  not_found: "ไม่พบรายการ",
  other_doc:
    "รายการนี้มีเอกสารระบบอื่น (เช่น ใบรับรองแทนใบเสร็จ) บันทึกไว้แล้ว — ดาวน์โหลด/พิมพ์หนังสือรับรองจากหน้านี้ได้ แต่ระบบยังเก็บได้ทีละเอกสารต่อรายการ",
};

export async function POST(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const org = await getOrgContext(session.userId);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { paymentId } = await params;
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(paymentId)) {
    return NextResponse.json({ error: "paymentId ไม่ถูกต้อง" }, { status: 400 });
  }

  // CO-07b/CO-30: project_manager เฉพาะรายการในขอบเขตโปรเจกต์ (กฎเดียวกับ GET /api/documents/wht-cert)
  const sheets = await getSheetsService(org.orgId);
  const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
  if (!payment || !isPaymentInScope({ role: org.role, eventScope: org.eventScope }, payment)) {
    return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  }

  const r = await autoSaveWhtCert({
    orgId: org.orgId,
    paymentId,
    userId: session.userId,
    spreadsheetId: org.googleSpreadsheetId,
  });
  switch (r.status) {
    case "saved":
    case "exists":
      return NextResponse.json({ success: true, fileUrl: r.fileUrl, deduped: r.status === "exists" });
    case "skipped":
      return NextResponse.json(
        { success: false, error: SKIP_MESSAGE[r.reason], reason: r.reason },
        { status: r.reason === "no_wht" || r.reason === "not_found" ? 422 : 409 },
      );
    default:
      return NextResponse.json({ success: false, error: `บันทึกไม่สำเร็จ: ${r.error}` }, { status: 500 });
  }
}
