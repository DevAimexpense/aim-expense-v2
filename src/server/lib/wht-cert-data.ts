// ===========================================
// ข้อมูลหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ของ payment หนึ่งรายการ
// ใช้ร่วมกันระหว่างหน้า /documents/wht-cert/[paymentId] และ
// API /api/documents/wht-cert/[paymentId] (สร้าง PDF)
// ===========================================

import { getSheetsService } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { findWthTypeByRate } from "@/lib/wth-types";
import {
  generateWhtDocNumber,
  getPndForm,
  mapWhtToIncomeSection,
  type WhtIncomeSection,
} from "@/lib/wht-doc-utils";

export interface WhtCertData {
  docNumber: { book: string; number: string };
  pndForm: "3" | "53";
  incomeSection: WhtIncomeSection;
  incomeLabel: string;
  payer: {
    name: string;
    taxId: string;
    address: string;
    branchInfo: string;
    signatureUrl: string | null;
  };
  payee: { name: string; taxId: string; address: string; branchInfo: string };
  payment: {
    paymentId: string;
    description: string;
    paymentDate: string;
    totalBeforeTax: number;
    wthRate: number;
    wthAmount: number;
    eventName: string;
  };
}

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
    console.warn(`[wht-cert] payment ${paymentId} not found, retry after ${delay}ms`);
  }
  return null;
}

/** คืน null เมื่อไม่พบ payment หรือ org */
export async function loadWhtCertData(
  orgId: string,
  paymentId: string
): Promise<WhtCertData | null> {
  const sheets = await getSheetsService(orgId);
  const payment = await getPaymentWithRetry(sheets, paymentId);
  if (!payment) return null;

  let event = null;
  let payee = null;
  let org = null;
  try {
    event = await sheets.getEventById(payment.EventID);
    payee = await sheets.getPayeeById(payment.PayeeID);
    org = await prisma.organization.findUnique({
      where: { id: orgId },
    });
  } catch (e) {
    console.error(`[wht-cert] fetch related data failed:`, e);
  }
  if (!org) return null;

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
    console.error(`[wht-cert] getPayments() failed:`, e);
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

  return {
    docNumber,
    pndForm,
    incomeSection,
    incomeLabel,
    payer: {
      name: org.name,
      taxId: org.taxId,
      address: org.address,
      branchInfo: payerBranchInfo,
      signatureUrl: org.signatureUrl,
    },
    payee: {
      name: payee?.PayeeName || "",
      taxId: payee?.TaxID || "",
      address: payee?.Address || "",
      branchInfo: payeeBranchInfo,
    },
    payment: {
      paymentId: payment.PaymentID,
      description: payment.Description || "",
      paymentDate,
      totalBeforeTax: totalAmount,
      wthRate,
      wthAmount,
      eventName: event?.EventName || "",
    },
  };
}
