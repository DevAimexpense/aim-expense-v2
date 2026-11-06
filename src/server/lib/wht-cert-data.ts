// ===========================================
// ข้อมูลหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ของ payment หนึ่งรายการ
// ใช้ร่วมกันระหว่างหน้า /documents/wht-cert/[paymentId] และ
// API /api/documents/wht-cert/[paymentId] (สร้าง PDF)
// ===========================================

import { getSheetsService, ensureTabsCached } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { withLock } from "./lock";
import { scopedEventIds } from "@/lib/permissions";
import { findWthTypeByRate } from "@/lib/wth-types";
import {
  parseWhtCertSeq,
  generateWhtDocNumber,
  getPndForm,
  mapWhtToIncomeSection,
  resolveWhtCertDate,
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

/** ยังไม่มีวันที่จ่ายเงิน/วันที่ใบเสร็จ → ออกหนังสือรับรองไม่ได้ */
export class WhtCertNoDateError extends Error {
  constructor() {
    super(
      "ยังออกหนังสือรับรองหัก ณ ที่จ่ายไม่ได้ — รายการนี้ยังไม่มีวันที่จ่ายเงินหรือวันที่ตามใบเสร็จ (บันทึกจ่ายเงินหรือแนบใบเสร็จก่อน)"
    );
    this.name = "WhtCertNoDateError";
  }
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

/** ผู้เปิดเอกสาร — ใช้กั้นขอบเขต project_manager (CO-07b/CO-30); ไม่ส่ง = ไม่กั้น (ผู้เรียกฝั่ง server ที่เช็คเองแล้ว) */
export interface WhtCertViewer {
  role: string;
  eventScope: string[];
}

/**
 * CO-30: กฎเดียวกับ payment.getById — project_manager เห็นเฉพาะรายการจ่ายในโปรเจกต์ที่ได้รับมอบหมาย
 * (ไม่มีข้อยกเว้น "รายการที่ตัวเองสร้าง" — 50 ทวิ เป็นเอกสารของรายการจ่าย ไม่ใช่เอกสารรายรับที่ PM ออกเอง)
 * บทบาทอื่นเห็นทุกรายการ
 */
export function isPaymentInScope(
  viewer: { role: string; eventScope: string[] } | null | undefined,
  payment: { EventID?: string | null },
): boolean {
  const scope = scopedEventIds(viewer);
  return scope === null || scope.includes((payment.EventID || "").trim());
}

/** คืน null เมื่อไม่พบ payment หรือ org (หรือ viewer ไม่มีสิทธิ์เห็นรายการนี้) */
export async function loadWhtCertData(
  orgId: string,
  paymentId: string,
  viewer?: WhtCertViewer
): Promise<WhtCertData | null> {
  const sheets = await getSheetsService(orgId);
  // CO-23: route นี้เข้าตรงได้โดยไม่ผ่าน router → ต้องให้ Sheet มีคอลัมน์ WhtCertNo ก่อนเขียนเลข
  await ensureTabsCached(sheets, orgId);
  const payment = await getPaymentWithRetry(sheets, paymentId);
  if (!payment) return null;
  // CO-07b/CO-30: project_manager เปิดได้เฉพาะรายการในโปรเจกต์ที่ได้รับมอบหมาย (กฎเดียวกับ payment.getById)
  // (เช็คก่อนออกเลข — ผู้ที่ไม่มีสิทธิ์ต้องไม่ทำให้เลข 50 ทวิ ถูกออก/บันทึก)
  if (viewer && !isPaymentInScope(viewer, payment)) {
    return null;
  }

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
  // วันที่ของหนังสือรับรอง = วันที่จ่ายเงิน หรือวันที่ตามใบเสร็จเท่านั้น
  // (ไม่ใช้วันที่คีย์รายการ / วันที่อนุมัติ / วันนี้)
  const paymentDate = resolveWhtCertDate(payment);
  if (!paymentDate) throw new WhtCertNoDateError();

  // หา WHT type (best guess จาก rate)
  const wthType = findWthTypeByRate(wthRate);
  const wthTypeId = wthType?.id || "custom";
  const { section: incomeSection, label: incomeLabel } = mapWhtToIncomeSection(wthTypeId);

  // ตัดสิน ภ.ง.ด. form: 3 (บุคคล) หรือ 53 (นิติบุคคล)
  const pndForm = getPndForm(payee?.TaxID || "", payee?.BranchType);

  // DOC-04: เลขที่ออกไปแล้วต้องคงที่ — ใช้ค่าที่เก็บใน Payments.WhtCertNo ("เล่มที่|เลขที่") ถ้ามี
  // DOC-21: ออกเลขใหม่ภายใต้ lock ต่อ org+เดือน และอ่าน Sheet สดในนั้น — seq ใหม่ = max(เลขที่เก็บไว้
  // ของทุกใบในเดือน, ตำแหน่งในลิสต์) + 1 จึงไม่ซ้ำแม้รายการก่อนหน้าถูกยกเลิก · เลขที่บันทึกแล้วไม่ถูกแก้
  // การบันทึกล้มเหลวไม่ทำให้ใบออกไม่ได้
  const parseStored = (raw: string | undefined): { book: string; number: string } | null => {
    const v = String(raw || "");
    if (!v.includes("|")) return null;
    const [book, number] = v.split("|");
    return { book, number };
  };
  let docNumber = parseStored(payment.WhtCertNo);
  if (!docNumber) {
    const docDate = new Date(paymentDate);
    const docYear = docDate.getFullYear();
    const docMonth = docDate.getMonth() + 1;
    const lockKey = `whtno:${orgId}:${docYear}-${String(docMonth).padStart(2, "0")}`;
    docNumber = await withLock(lockKey, async () => {
      // อ่านทั้งเดือนสดใต้ lock (updateById ของ request ก่อนหน้า invalidate cache แล้ว)
      let monthPayments: Array<{ PaymentID: string; CreatedAt: string; WhtCertNo?: string }> = [];
      try {
        const allPayments = await sheets.getPayments();
        // ถ้ามี request อื่นออกเลขให้ใบนี้ไปแล้วระหว่างรอ lock → ใช้เลขนั้น ไม่ออกใหม่
        const latest = allPayments.find((p) => p.PaymentID === payment.PaymentID);
        const already = parseStored(latest?.WhtCertNo);
        if (already) return already;
        monthPayments = allPayments
          .filter((p) => {
            // รายการที่ยกเลิก/ถูกปฏิเสธไม่อยู่ในลำดับเลขหนังสือรับรอง — ไม่เช่นนั้นเลขของใบที่พิมพ์ไปแล้ว
            // จะเลื่อนเมื่อรายการก่อนหน้าถูกยกเลิก (DOC-04)
            // DOC-30: แต่ถ้าใบนั้นออกเลขไปแล้ว ต้องคงอยู่ในลิสต์เพื่อกันเลขซ้ำ (เลขที่เก็บแล้วไม่คำนวณใหม่)
            if (
              (p.Status === "cancelled" || p.Status === "rejected") &&
              parseWhtCertSeq(p.WhtCertNo || "") === null
            )
              return false;
            const pDateStr = resolveWhtCertDate(p);
            if (!pDateStr) return false;
            const d = new Date(pDateStr);
            return (
              d.getFullYear() === docYear &&
              d.getMonth() + 1 === docMonth &&
              parseFloat(p.WTHAmount || "0") > 0
            );
          })
          .map((p) => ({ PaymentID: p.PaymentID, CreatedAt: p.CreatedAt || "", WhtCertNo: p.WhtCertNo || "" }));
      } catch (e) {
        // DOC-31: เดาเป็น /001 แล้วเก็บถาวรไม่ได้ (จะซ้ำ) → ให้ render ล้ม ผู้ใช้ลองใหม่
        console.error(`[wht-cert] getPayments() failed:`, e);
        throw new Error("อ่านรายการจ่ายเงินของเดือนนี้ไม่สำเร็จ ยังไม่ได้ออกเลขหนังสือรับรอง กรุณาลองใหม่อีกครั้ง");
      }
      const generated = generateWhtDocNumber(paymentDate, monthPayments, payment.PaymentID);
      try {
        await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", payment.PaymentID, {
          WhtCertNo: `${generated.book}|${generated.number}`,
        });
      } catch (e) {
        console.error("[wht-cert] persist WhtCertNo failed:", e);
      }
      return generated;
    });
  }

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
