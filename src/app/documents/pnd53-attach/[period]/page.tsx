// ===========================================
// /documents/pnd53-attach/[period] — Server entry
// ใบแนบ ภ.ง.ด.53 (รายการหัก ณ ที่จ่าย — นิติบุคคล)
//
// period = YYYY-MM (เช่น "2026-04")
// Aggregate รายการ paid + WTH > 0 ในเดือนนั้น → filter vendor type = pnd53
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
import { isSettled } from "@/lib/payment-status";
import { PND53AttachDocument, type PND53AttachRow } from "./document";

export const metadata = {
  title: "ใบแนบ ภ.ง.ด.53 | Aim Expense",
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s || "0");
  return isNaN(n) ? 0 : n;
};

// WHT-12: งวด ภ.ง.ด. ใช้วันเดียวกับที่พิมพ์บน 50 ทวิ
const paidDateOf = (p: Record<string, string>): string => whtPeriodDate(p);

export default async function PND53AttachPage({
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

  const rows: PND53AttachRow[] = [];
  for (const p of payments) {
    if (!isSettled(p.Status)) continue; // paid | cleared — DOC-02
    const wth = num(p.WTHAmount);
    if (wth <= 0) continue;

    const paidDate = paidDateOf(p);
    if (!paidDate) continue;
    if (paidDate < periodInfo.fromISO || paidDate > periodInfo.toISO) continue;

    const info = payeeMap.get(p.PayeeID);
    const taxId = p.VendorTaxIdSnapshot || info?.taxId || "" /* PUR-09: ตามที่บันทึกตอนจ่าย (แก้ทะเบียนทีหลังไม่ทำให้รายงานที่ยื่นแล้วเปลี่ยน) */;

    // Filter to ภ.ง.ด.53 (juristic — TaxID 13 digits starting with "0")
    if (vendorTypeOf(taxId, info?.branchType) !== "pnd53") continue;

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
      condition: 1, // 1 = หัก ณ ที่จ่าย (default — system doesn't yet capture 2)
    });
  }

  rows.sort((a, b) => {
    if (a.paidDate !== b.paidDate) return a.paidDate < b.paidDate ? -1 : 1;
    return a.payeeName.localeCompare(b.payeeName, "th");
  });

  return (
    <PND53AttachDocument
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
