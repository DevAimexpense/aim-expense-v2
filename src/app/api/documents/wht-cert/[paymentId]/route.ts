// ===========================================
// GET /api/documents/wht-cert/[paymentId]
// PDF หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — ฟอร์มกรมสรรพากรต้นฉบับ + ข้อมูลแบบ vector
//   ?download=1 → ดาวน์โหลดเป็นไฟล์ (ปกติเปิดดูใน browser)
// ===========================================

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { loadWhtCertData, WhtCertNoDateError } from "@/server/lib/wht-cert-data";
import { buildWhtCertPdf } from "@/server/lib/wht-cert-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const org = await getOrgContext(session.userId);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const { paymentId } = await params;
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(paymentId)) {
    return NextResponse.json({ error: "paymentId ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    // CO-07b/CO-30: project_manager เห็นเฉพาะรายการในขอบเขตโปรเจกต์ — นอกนั้น 404 เหมือน tRPC payment.getById
    const data = await loadWhtCertData(org.orgId, paymentId, {
      role: org.role,
      eventScope: org.eventScope,
    });
    if (!data) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }
    const bytes = await buildWhtCertPdf(data);

    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = `50tawi-${data.docNumber.book}-${data.docNumber.number.replace("/", "-")}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "cache-control": "no-store",
        // ให้หน้า viewer ใช้ต่อ (ตั้งชื่อไฟล์ / จัดโฟลเดอร์ตอนบันทึกลง Drive) โดยไม่ต้องโหลดข้อมูลซ้ำ
        "x-doc-date": data.payment.paymentDate,
        "x-doc-number": `${data.docNumber.book}-${data.docNumber.number}`,
        "x-doc-filename": filename,
      },
    });
  } catch (err) {
    if (err instanceof WhtCertNoDateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // route ที่ client อ่านผลเป็นไฟล์ — ห้ามปล่อย exception หลุดเป็น 500 body ว่าง
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wht-cert/pdf]", err);
    return NextResponse.json({ error: `สร้างเอกสารไม่สำเร็จ: ${message}` }, { status: 500 });
  }
}
