// ===========================================
// หนังสือรับรองการหักภาษี ณ ที่จ่าย (Withholding Tax Certificate)
// ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { WthCertDocument } from "./document";
import { findWthTypeByRate } from "@/lib/wth-types";
import { generateWhtDocNumber, getPndForm, mapWhtToIncomeSection } from "@/lib/wht-doc-utils";
import { AutoFailMessenger } from "@/lib/utils/auto-fail-messenger";

// Retry getById ไม่กี่ครั้งเพื่อรอ Sheets eventual consistency
// (กรณี iframe auto-save ที่ payment เพิ่งถูก append — Sheets API อาจยังไม่ commit ทัน)
async function getPaymentWithRetry(
  sheets: Awaited<ReturnType<typeof getSheetsService>>,
  paymentId: string
): Promise<Record<string, string> | null> {
  const delays = [0, 500, 1500]; // รวม 2 วินาที max
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
    if (payment) return payment;
    console.warn(`[wht-cert/page] payment ${paymentId} not found, retry after ${delay}ms`);
  }
  return null;
}

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
  console.log(`[wht-cert/page] render paymentId=${paymentId} orgId=${orgCtx.orgId}`);

  const sheets = await getSheetsService(orgCtx.orgId);

  // Retry (eventual consistency ของ Google Sheets)
  const payment = await getPaymentWithRetry(sheets, paymentId);
  if (!payment) {
    console.error(`[wht-cert/page] payment ${paymentId} NOT FOUND after retries`);
    // แทนที่จะ redirect (ทำให้ iframe ไม่ได้ response) → render error page ให้ client auto-save ส่ง postMessage error
    return (
      <WhtCertNotFound paymentId={paymentId} />
    );
  }

  let event = null;
  let payee = null;
  let org = null;
  try {
    event = await sheets.getEventById(payment.EventID);
    payee = await sheets.getPayeeById(payment.PayeeID);
    org = await prisma.organization.findUnique({
      where: { id: orgCtx.orgId },
    });
  } catch (e) {
    console.error(`[wht-cert/page] fetch related data failed:`, e);
  }
  if (!org) {
    return <WhtCertNotFound paymentId={paymentId} reason="organization not found" />;
  }

  // Parse payment data
  const totalAmount = parseFloat(payment.TTLAmount) || 0;
  const wthAmount = parseFloat(payment.WTHAmount) || 0;
  const wthRate = parseFloat(payment.PctWTH) || 0;
  const paymentDate =
    payment.PaymentDate || payment.ApprovedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  // หา WHT type (best guess จาก rate)
  const wthType = findWthTypeByRate(wthRate);
  const wthTypeId = wthType?.id || "custom";
  const { section: incomeSection, label: incomeLabel } = mapWhtToIncomeSection(wthTypeId);

  // ตัดสิน ภ.ง.ด. form: 3 (บุคคล) หรือ 53 (นิติบุคคล)
  const pndForm = getPndForm(payee?.TaxID || "", payee?.BranchType);

  // Generate เลขเล่มที่/เลขที่ — ต้อง query payment ทั้งเดือนที่มี WHT > 0
  let monthPayments: Array<{ PaymentID: string; CreatedAt: string }> = [];
  try {
    const allPayments = await sheets.getPayments();
    const docDate = new Date(paymentDate);
    const docYear = docDate.getFullYear();
    const docMonth = docDate.getMonth() + 1;
    monthPayments = allPayments
      .filter((p) => {
        const pDateStr = p.PaymentDate || p.ApprovedAt?.slice(0, 10);
        if (!pDateStr) return false;
        const d = new Date(pDateStr);
        return (
          d.getFullYear() === docYear &&
          d.getMonth() + 1 === docMonth &&
          parseFloat(p.WTHAmount || "0") > 0
        );
      })
      .map((p) => ({ PaymentID: p.PaymentID, CreatedAt: p.CreatedAt || "" }));
  } catch (e) {
    console.error(`[wht-cert/page] getPayments() failed:`, e);
    // ถ้า query ล้มเหลว → fallback ใช้รายการเดียว (seq = 1)
    monthPayments = [{ PaymentID: payment.PaymentID, CreatedAt: payment.CreatedAt || "" }];
  }

  const docNumber = generateWhtDocNumber(paymentDate, monthPayments, payment.PaymentID);

  // Branch info (สำหรับชื่อผู้มีหน้าที่หัก)
  const payerBranchInfo =
    org.branchType === "HQ"
      ? "สำนักงานใหญ่"
      : org.branchNumber
      ? `สาขา ${org.branchNumber}`
      : "";
  const payeeBranchInfo = payee?.BranchType === "HQ"
    ? "สำนักงานใหญ่"
    : payee?.BranchNumber
    ? `สาขา ${payee.BranchNumber}`
    : "";

  console.log(`[wht-cert/page] render OK — docNumber=${docNumber.book}/${docNumber.number}`);

  return (
    <WthCertDocument
      docNumber={docNumber}
      pndForm={pndForm}
      incomeSection={incomeSection}
      incomeLabel={incomeLabel}
      payer={{
        name: org.name,
        taxId: org.taxId,
        address: org.address,
        branchInfo: payerBranchInfo,
      }}
      payee={{
        name: payee?.PayeeName || "",
        taxId: payee?.TaxID || "",
        address: payee?.Address || "",
        branchInfo: payeeBranchInfo,
      }}
      payment={{
        paymentId: payment.PaymentID,
        description: payment.Description || "",
        paymentDate,
        totalBeforeTax: totalAmount,
        wthRate,
        wthAmount,
        eventName: event?.EventName || "",
      }}
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
