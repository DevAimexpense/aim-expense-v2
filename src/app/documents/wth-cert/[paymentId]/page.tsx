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

  const sheets = await getSheetsService(orgCtx.orgId);
  const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", paymentId);
  if (!payment) redirect("/payments");

  const event = await sheets.getEventById(payment.EventID);
  const payee = await sheets.getPayeeById(payment.PayeeID);

  const org = await prisma.organization.findUnique({
    where: { id: orgCtx.orgId },
  });
  if (!org) redirect("/");

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
  const allPayments = await sheets.getPayments();
  const docDate = new Date(paymentDate);
  const docYear = docDate.getFullYear();
  const docMonth = docDate.getMonth() + 1;
  const monthPayments = allPayments
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
