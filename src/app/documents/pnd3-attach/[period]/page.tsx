// ===========================================
// /documents/pnd3-attach/[period] — Server entry
// ใบแนบ ภ.ง.ด.3 (รายการหัก ณ ที่จ่าย — บุคคลธรรมดา)
//
// period = YYYY-MM (เช่น "2026-04")
// Aggregate รายการ paid + WTH > 0 ในเดือนนั้น → filter vendor type = pnd3
// แบ่ง 6 ราย/แผ่น → multi-page (1/N)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { prisma } from "@/lib/prisma";
import {
  parsePeriod,
  vendorTypeOf,
  branchLabelOf,
} from "@/lib/wht-form-utils";
import { whtPeriodDate } from "@/lib/wht-doc-utils";
import { vendorTaxIdFor } from "@/lib/period-close";
import { getClosedThrough } from "@/server/lib/period-lock";
import { isSettled } from "@/lib/payment-status";
import { PND3AttachDocument, type PND3AttachRow } from "./document";

export const metadata = {
  title: "ใบแนบ ภ.ง.ด.3 | Aim Expense",
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s || "0");
  return isNaN(n) ? 0 : n;
};

// WHT-12: งวด ภ.ง.ด. ใช้วันเดียวกับที่พิมพ์บน 50 ทวิ
const paidDateOf = (p: Record<string, string>): string => whtPeriodDate(p);

export default async function PND3AttachPage({
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

  const payeeMap = new Map(
    payees.map((p) => [
      p.PayeeID,
      {
        name: p.PayeeName || p.PayeeID,
        taxId: p.TaxID || "",
        branchType: p.BranchType || "",
        branchNumber: p.BranchNumber || "",
        address: p.Address || "",
      },
    ]),
  );

  // Aggregate ใบแนบ ภงด.3 rows for this period
  const rows: PND3AttachRow[] = [];
  for (const p of payments) {
    if (!isSettled(p.Status)) continue; // paid | cleared — DOC-02
    const wth = num(p.WTHAmount);
    if (wth <= 0) continue;

    const paidDate = paidDateOf(p);
    if (!paidDate) continue;
    if (paidDate < periodInfo.fromISO || paidDate > periodInfo.toISO) continue;

    const info = payeeMap.get(p.PayeeID);
    const taxId = vendorTaxIdFor(p.VendorTaxIdSnapshot, info?.taxId, paidDateOf(p), closedThrough) /* PUR-09b */;

    // Filter to ภ.ง.ด.3 (personal — TaxID NOT starting with 0, or empty)
    if (vendorTypeOf(taxId, info?.branchType) !== "pnd3") continue;

    const incomeType =
      p.CategoryMain || p.Description || "ค่าบริการ";

    rows.push({
      paymentId: p.PaymentID,
      paidDate,
      payeeName: info?.name || p.PayeeID || "—",
      taxId,
      branchLabel: branchLabelOf(
        info?.branchType || "",
        info?.branchNumber || "",
      ),
      address: info?.address || "",
      incomeType,
      rate: num(p.PctWTH),
      incomeAmount: num(p.TTLAmount),
      whtAmount: wth,
      condition: 1, // 1 = หัก ณ ที่จ่าย (default — system doesn't yet capture 2/3)
    });
  }

  // Sort: paidDate asc, then payeeName
  rows.sort((a, b) => {
    if (a.paidDate !== b.paidDate) return a.paidDate < b.paidDate ? -1 : 1;
    return a.payeeName.localeCompare(b.payeeName, "th");
  });

  return (
    <PND3AttachDocument
      period={period}
      periodInfo={periodInfo}
      org={{
        name: org.name,
        taxId: org.taxId,
        branchType: org.branchType,
        branchNumber: org.branchNumber,
        address: org.address,
      }}
      rows={rows}
    />
  );
}
