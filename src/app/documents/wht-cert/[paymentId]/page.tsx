// ===========================================
// หนังสือรับรองการหักภาษี ณ ที่จ่าย (Withholding Tax Certificate)
// ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
//
// ตัวเอกสารคือ PDF (vector) จาก /api/documents/wht-cert/[paymentId] —
// หน้านี้เป็นตัวแสดง + ปุ่มพิมพ์/ดาวน์โหลด/บันทึกลง Drive
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { WthCertDocument } from "./document";
import { loadWhtCertData } from "@/server/lib/wht-cert-data";
import { AutoFailMessenger } from "@/lib/utils/auto-fail-messenger";

export default async function WthCertPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  const { paymentId } = await params;

  let data = null;
  try {
    data = await loadWhtCertData(orgCtx.orgId, paymentId);
  } catch (e) {
    console.error(`[wht-cert/page] load failed:`, e);
  }
  if (!data) {
    // render error page ให้ client auto-save ส่ง postMessage error กลับ parent (iframe)
    return <WhtCertNotFound paymentId={paymentId} />;
  }

  return (
    <WthCertDocument
      paymentId={data.payment.paymentId}
      paymentDate={data.payment.paymentDate}
      docNumber={data.docNumber}
      payeeName={data.payee.name}
    />
  );
}

/**
 * Client component — แสดงเมื่อหา payment ไม่เจอ
 * จะ auto-detect ?auto=1 แล้วส่ง postMessage error กลับ parent (iframe)
 */
function WhtCertNotFound({ paymentId, reason }: { paymentId: string; reason?: string }) {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <NotFoundAutoMessenger paymentId={paymentId} reason={reason} />
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        ไม่พบรายการ
      </h1>
      <p style={{ color: "#64748b", marginBottom: "1rem" }}>
        ไม่พบ payment id: <code>{paymentId}</code>
        {reason && <span> ({reason})</span>}
      </p>
      <a href="/payments" style={{ color: "#2563eb" }}>← กลับไปหน้าตั้งเบิก</a>
    </div>
  );
}

function NotFoundAutoMessenger({ paymentId, reason }: { paymentId: string; reason?: string }) {
  return <AutoFailMessenger paymentId={paymentId} reason={reason || "payment-not-found"} />;
}
