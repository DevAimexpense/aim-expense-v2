// ===========================================
// /documents/tax-invoice/[id] — Printable RD-compliant tax invoice
// (window.print() + html2canvas-based PDF download)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, ensureTabsCached } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { TaxInvoiceDocument } from "./document";

export const metadata = {
  title: "ใบกำกับภาษี | Aim Expense",
};

export default async function TaxInvoiceDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  const id = params.id;
  const sheets = await getSheetsService(orgCtx.orgId);
  await ensureTabsCached(sheets, orgCtx.orgId);

  const [batch, org] = await Promise.all([
    sheets.getAllBatch([SHEET_TABS.TAX_INVOICES, SHEET_TABS.TAX_INVOICE_LINES]),
    prisma.organization.findUnique({
      where: { id: orgCtx.orgId },
      select: {
        name: true,
        taxId: true,
        address: true,
        phone: true,
        branchType: true,
        branchNumber: true,
      },
    }),
  ]);

  const header = (batch[SHEET_TABS.TAX_INVOICES] || []).find(
    (r) => r.TaxInvoiceID === id,
  );
  if (!header) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>ไม่พบใบกำกับภาษี</h1>
        <a href="/tax-invoices">← กลับ</a>
      </div>
    );
  }

  const lines = (batch[SHEET_TABS.TAX_INVOICE_LINES] || [])
    .filter((r) => r.TaxInvoiceID === id)
    .sort(
      (a, b) =>
        (parseInt(a.LineNumber, 10) || 0) -
        (parseInt(b.LineNumber, 10) || 0),
    );

  if (!org) redirect("/");

  return (
    <TaxInvoiceDocument
      taxInvoiceId={id}
      org={{
        name: org.name,
        taxId: org.taxId,
        address: org.address || "",
        phone: org.phone || "",
        branchInfo:
          org.branchType === "Branch" && org.branchNumber
            ? `สาขา ${org.branchNumber.padStart(5, "0")}`
            : "สำนักงานใหญ่ (00000)",
      }}
      header={{
        docNumber: header.DocNumber || "",
        docDate: header.DocDate,
        status: header.Status || "draft",
        customerName: header.CustomerNameSnapshot,
        customerTaxId: header.CustomerTaxIdSnapshot,
        customerBranch: header.CustomerBranchSnapshot || "",
        customerAddress: header.CustomerAddressSnapshot,
        projectName: header.ProjectName || "",
        subtotal: parseFloat(header.Subtotal) || 0,
        discountAmount: parseFloat(header.DiscountAmount) || 0,
        vatAmount: parseFloat(header.VATAmount) || 0,
        vatIncluded:
          header.VATIncluded === "TRUE" || header.VATIncluded === "true",
        grandTotal: parseFloat(header.GrandTotal) || 0,
        notes: header.Notes || "",
        preparedBy: header.PreparedBy || "",
        issuedAt: header.IssuedAt || "",
        voidedAt: header.VoidedAt || "",
        voidReason: header.VoidReason || "",
      }}
      lines={lines.map((l) => ({
        lineNumber: parseInt(l.LineNumber, 10) || 0,
        description: l.Description || "",
        expenseNature: (l.ExpenseNature as "goods" | "service") || "service",
        quantity: parseFloat(l.Quantity) || 0,
        unitPrice: parseFloat(l.UnitPrice) || 0,
        discountPercent: parseFloat(l.DiscountPercent) || 0,
        lineTotal: parseFloat(l.LineTotal) || 0,
      }))}
    />
  );
}
