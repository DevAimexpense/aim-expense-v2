// ===========================================
// ใบรับรองแทนใบเสร็จรับเงิน (Substitute Receipt)
// สำหรับรายจ่ายที่ไม่มีใบเสร็จ (ค่าเบ็ดเตล็ด)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { SubstituteReceiptDocument } from "./document";
import { AutoFailMessenger } from "@/lib/utils/auto-fail-messenger";

// Retry getById ไม่กี่ครั้ง — รอ Google Sheets eventual consistency
async function getPaymentWithRetry(
  sheets: Awaited<ReturnType<typeof getSheetsService>>,
  paymentId: string
) {
  for (const delay of [0, 500, 1500]) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const p = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (p) return p;
  }
  return null;
}

export default async function SubstituteReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  const { paymentId } = await params;
  console.log(`[substitute-receipt/page] render paymentId=${paymentId}`);
  const sheets = await getSheetsService(orgCtx.orgId);
  const payment = await getPaymentWithRetry(sheets, paymentId);
  if (!payment) {
    console.error(`[substitute-receipt/page] payment ${paymentId} NOT FOUND`);
    return (
      <div style={{ padding: "2rem" }}>
        <AutoFailMessenger paymentId={paymentId} reason="payment-not-found" />
        <h1>ไม่พบรายการ</h1>
        <a href="/payments">← กลับไปหน้าตั้งเบิก</a>
      </div>
    );
  }

  const event = await sheets.getEventById(payment.EventID);
  const payee = await sheets.getPayeeById(payment.PayeeID);
  const org = await prisma.organization.findUnique({ where: { id: orgCtx.orgId } });
  if (!org) redirect("/");

  return (
    <SubstituteReceiptDocument
      company={{ name: org.name, taxId: org.taxId, address: org.address }}
      requester={{ name: payment.CreatedBy || session.displayName }}
      payee={{ name: payee?.PayeeName || "" }}
      payment={{
        paymentId: payment.PaymentID,
        description: payment.Description || "",
        date: payment.PaymentDate || payment.ApprovedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        amount: parseFloat(payment.GTTLAmount) || 0,
        eventName: event?.EventName || "",
        notes: payment.Notes || "",
      }}
    />
  );
}
