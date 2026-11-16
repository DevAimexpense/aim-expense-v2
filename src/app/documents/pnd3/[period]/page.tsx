// ===========================================
// /documents/pnd3/[period] — Server entry
// ภ.ง.ด.3 (ใบสรุปยอดเดือน — บุคคลธรรมดา)
//
// period = YYYY-MM
// 1 หน้า — สรุปยอดรวม (เงินได้ / ภาษี / จำนวนราย/แผ่น)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { prisma } from "@/lib/prisma";
import {
  parsePeriod,
  vendorTypeOf,
} from "@/lib/wht-form-utils";
import { whtPeriodDate } from "@/lib/wht-doc-utils";
import { isSettled } from "@/lib/payment-status";
import { PND3SummaryDocument } from "./document";

export const metadata = {
  title: "ภ.ง.ด.3 ใบสรุปยอดเดือน | Aim Expense",
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s || "0");
  return isNaN(n) ? 0 : n;
};

// WHT-12: งวด ภ.ง.ด. ใช้วันเดียวกับที่พิมพ์บน 50 ทวิ
const paidDateOf = (p: Record<string, string>): string => whtPeriodDate(p);

export default async function PND3SummaryPage({
  params,
}: {
  params: Promise<{ period: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");
  // CTRL-06: ใบแนบ ภ.ง.ด. มีเลขภาษี/ยอดของผู้รับเงินทุกราย — เฉพาะผู้มีสิทธิ์ดูรายงาน (เหมือนเมนู)
  if (orgCtx.role !== "admin" && !orgCtx.permissions.viewReports) redirect("/dashboard");

  const { period } = await params;
  const periodInfo = parsePeriod(period);

  const sheets = await getSheetsService(orgCtx.orgId);
  const [payments, payees, org] = await Promise.all([
    sheets.getPayments(),
    sheets.getPayees(),
    prisma.organization.findUnique({ where: { id: orgCtx.orgId } }),
  ]);

  if (!org) redirect("/");

  // TaxID + BranchType ของผู้รับเงิน — ใช้ตัดสิน ภ.ง.ด.3/53 ด้วยกฎเดียวกับใบ 50 ทวิ (DOC-07)
  const payeeInfoMap = new Map(
    payees.map((p) => [p.PayeeID, { taxId: p.TaxID || "", branchType: p.BranchType || "" }]),
  );

  // Aggregate stats for this period & form type
  let totalCount = 0;
  let totalIncome = 0;
  let totalWHT = 0;
  for (const p of payments) {
    if (!isSettled(p.Status)) continue; // paid | cleared — DOC-02
    const wth = num(p.WTHAmount);
    if (wth <= 0) continue;
    const paidDate = paidDateOf(p);
    if (!paidDate) continue;
    if (paidDate < periodInfo.fromISO || paidDate > periodInfo.toISO) continue;

    const info = payeeInfoMap.get(p.PayeeID);
    const taxId = p.VendorTaxIdSnapshot || info?.taxId || "" /* PUR-09: ตามที่บันทึกตอนจ่าย (แก้ทะเบียนทีหลังไม่ทำให้รายงานที่ยื่นแล้วเปลี่ยน) */;
    if (vendorTypeOf(taxId, info?.branchType) !== "pnd3") continue;

    totalCount += 1;
    totalIncome += num(p.TTLAmount);
    totalWHT += wth;
  }
  const totalSheets = Math.max(1, Math.ceil(totalCount / 6));

  return (
    <PND3SummaryDocument
      period={period}
      periodInfo={periodInfo}
      org={{
        name: org.name,
        taxId: org.taxId,
        branchType: org.branchType,
        branchNumber: org.branchNumber,
        address: org.address,
      }}
      stats={{
        totalCount,
        totalIncome,
        totalWHT,
        totalSheets,
      }}
    />
  );
}
