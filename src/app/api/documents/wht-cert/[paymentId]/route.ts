// ===========================================
// GET /api/documents/wht-cert/[paymentId]
// PDF หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — ฟอร์มกรมสรรพากรต้นฉบับ + ข้อมูลแบบ vector
//   ?download=1 → ดาวน์โหลดเป็นไฟล์ (ปกติเปิดดูใน browser)
// ===========================================

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { loadWhtCertData } from "@/server/lib/wht-cert-data";
import { generateWhtCertPdf } from "@/lib/wht-cert/generate";

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
    const data = await loadWhtCertData(org.orgId, paymentId);
    if (!data) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }
    const withBranch = (name: string, branch: string) =>
      branch ? `${name} (${branch})` : name;
    const bytes = await generateWhtCertPdf({
      bookNo: data.docNumber.book,
      docNo: data.docNumber.number,
      // ลำดับที่ในแบบ ภ.ง.ด. = ลำดับ running ของเดือน (ส่วนท้ายของเลขที่เอกสาร)
      sequenceNo: String(parseInt(data.docNumber.number.split("/")[1] || "1", 10) || 1),
      pndForm: data.pndForm,
      payer: {
        name: withBranch(data.payer.name, data.payer.branchInfo),
        taxId: data.payer.taxId,
        address: data.payer.address || "",
        signatureUrl: data.payer.signatureUrl,
      },
      payee: {
        name: withBranch(data.payee.name, data.payee.branchInfo),
        taxId: data.payee.taxId,
        address: data.payee.address || "",
      },
      incomeSection: data.incomeSection,
      incomeNote: [data.incomeLabel, data.payment.description].filter(Boolean).join(" — "),
      paidDate: data.payment.paymentDate,
      amount: data.payment.totalBeforeTax,
      tax: data.payment.wthAmount,
    });

    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = `50tawi-${data.docNumber.book}-${data.docNumber.number.replace("/", "-")}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // route ที่ client อ่านผลเป็นไฟล์ — ห้ามปล่อย exception หลุดเป็น 500 body ว่าง
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wht-cert/pdf]", err);
    return NextResponse.json({ error: `สร้างเอกสารไม่สำเร็จ: ${message}` }, { status: 500 });
  }
}
