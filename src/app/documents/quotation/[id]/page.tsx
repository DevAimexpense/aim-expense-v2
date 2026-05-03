// ===========================================
// /documents/quotation/[id] — Printable view
// ใช้ window.print() ของ browser (save as PDF เอง)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, ensureTabsCached } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { QuotationDocument } from "./document";

export const metadata = {
  title: "ใบเสนอราคา | Aim Expense",
};

export default async function QuotationDocumentPage({
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
  await ensureTabsCached(sheets, orgCtx.orgId);

  // batchGet (header + lines in 1 HTTP call) parallel with prisma org lookup
  const [batch, org] = await Promise.all([
    sheets.getAllBatch([SHEET_TABS.QUOTATIONS, SHEET_TABS.QUOTATION_LINES]),
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

  const header = (batch[SHEET_TABS.QUOTATIONS] || []).find(
    (r) => r.QuotationID === id
  );
  if (!header) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>ไม่พบใบเสนอราคา</h1>
        <a href="/quotations">← กลับ</a>
      </div>
    );
  }

  const lines = (batch[SHEET_TABS.QUOTATION_LINES] || [])
    .filter((r) => r.QuotationID === id)
    .sort(
      (a, b) =>
        (parseInt(a.LineNumber, 10) || 0) - (parseInt(b.LineNumber, 10) || 0)
    );

  if (!org) redirect("/");

  return (
    <QuotationDocument
      quotationId={id}
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
        validUntil: header.ValidUntil,
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
        grandTotal: parseFloat(header.GrandTotal) || 0,
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
