// ===========================================
// /documents/billing/[id] — Printable view
// ใช้ window.print() ของ browser
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService } from "@/server/lib/sheets-context";
import { prisma } from "@/lib/prisma";
import { BillingDocument } from "./document";

export const metadata = {
  title: "ใบวางบิล | Aim Expense",
};

export default async function BillingDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  const { id } = await params;
  const sheets = await getSheetsService(orgCtx.orgId);
  await sheets.ensureAllTabsExist();

  const header = await sheets.getBillingById(id);
  if (!header) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>ไม่พบใบวางบิล</h1>
        <a href="/billings">← กลับ</a>
      </div>
    );
  }

  const lines = await sheets.getBillingLines(id);
  lines.sort(
    (a, b) =>
      (parseInt(a.LineNumber, 10) || 0) - (parseInt(b.LineNumber, 10) || 0)
  );

  const org = await prisma.organization.findUnique({
    where: { id: orgCtx.orgId },
    select: {
      name: true,
      taxId: true,
      address: true,
      phone: true,
      branchType: true,
      branchNumber: true,
    },
  });
  if (!org) redirect("/");

  return (
    <BillingDocument
      org={{
        name: org.name,
        taxId: org.taxId,
        address: org.address || "",
        phone: org.phone || "",
        branchInfo:
          org.branchType === "Branch" && org.branchNumber
            ? `สาขา ${org.branchNumber}`
            : "สำนักงานใหญ่",
      }}
      header={{
        docNumber: header.DocNumber,
        docDate: header.DocDate,
        dueDate: header.DueDate,
        status: header.Status || "draft",
        customerName: header.CustomerNameSnapshot,
        customerTaxId: header.CustomerTaxIdSnapshot,
        customerAddress: header.CustomerAddressSnapshot,
        projectName: header.ProjectName || "",
        subtotal: parseFloat(header.Subtotal) || 0,
        discountAmount: parseFloat(header.DiscountAmount) || 0,
        vatAmount: parseFloat(header.VATAmount) || 0,
        vatIncluded:
          header.VATIncluded === "TRUE" || header.VATIncluded === "true",
        whtPercent: parseFloat(header.WHTPercent) || 0,
        whtAmount: parseFloat(header.WHTAmount) || 0,
        grandTotal: parseFloat(header.GrandTotal) || 0,
        amountReceivable: parseFloat(header.AmountReceivable) || 0,
        paidAmount: parseFloat(header.PaidAmount) || 0,
        notes: header.Notes || "",
        terms: header.Terms || "",
        preparedBy: header.PreparedBy || "",
      }}
      lines={lines.map((l) => ({
        lineNumber: parseInt(l.LineNumber, 10) || 0,
        description: l.Description || "",
        quantity: parseFloat(l.Quantity) || 0,
        unitPrice: parseFloat(l.UnitPrice) || 0,
        discountPercent: parseFloat(l.DiscountPercent) || 0,
        lineTotal: parseFloat(l.LineTotal) || 0,
      }))}
    />
  );
}
