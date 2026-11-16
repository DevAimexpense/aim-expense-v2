// ===========================================
// /documents/pnd53/[period] — Server entry
// ภ.ง.ด.53 (ใบสรุปยอดเดือน — นิติบุคคล)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { prisma } from "@/lib/prisma";
import { parsePeriod, vendorTypeOf } from "@/lib/wht-form-utils";
import { whtPeriodDate } from "@/lib/wht-doc-utils";
import { vendorTaxIdFor } from "@/lib/period-close";
import { getClosedThrough } from "@/server/lib/period-lock";
import { isSettled } from "@/lib/payment-status";
import { PND53SummaryDocument } from "./document";

export const metadata = {
  title: "ภ.ง.ด.53 ใบสรุปยอดเดือน | Aim Expense",
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s || "0");
  return isNaN(n) ? 0 : n;
};

// WHT-12: งวด ภ.ง.ด. ใช้วันเดียวกับที่พิมพ์บน 50 ทวิ
const paidDateOf = (p: Record<string, string>): string => whtPeriodDate(p);

export default async function PND53SummaryPage({
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
  const closedThrough = await getClosedThrough(orgCtx.orgId); // PUR-09b

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
    const taxId = vendorTaxIdFor(p.VendorTaxIdSnapshot, info?.taxId, paidDateOf(p), closedThrough) /* PUR-09b */;
    if (vendorTypeOf(taxId, info?.branchType) !== "pnd53") continue;

    totalCount += 1;
    totalIncome += num(p.TTLAmount);
    totalWHT += wth;
  }
  const totalSheets = Math.max(1, Math.ceil(totalCount / 6));

  return (
    <PND53SummaryDocument
      period={period}
      periodInfo={periodInfo}
      org={{
        name: org.name,
        taxId: org.taxId,
        branchType: org.branchType,
        branchNumber: org.branchNumber,
        address: org.address,
      }}
      stats={{ totalCount, totalIncome, totalWHT, totalSheets }}
    />
  );
}
