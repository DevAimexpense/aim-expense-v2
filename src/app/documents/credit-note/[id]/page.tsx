// ===========================================
// /documents/credit-note/[id] — ใบลดหนี้ / ใบเพิ่มหนี้ พิมพ์ได้ (SALE-02 · ม.86/9-10)
// ===========================================

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { requireCompanyOrg } from "@/lib/auth/require-plan";
import { getSheetsService, ensureTabsCached } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { isDocInScope } from "@/server/lib/doc-scope";
import { noteReasonLabel } from "@/lib/credit-note";
import { CreditNoteDocument } from "./document";

export const metadata = {
  title: "ใบลดหนี้ / ใบเพิ่มหนี้ | Aim Expense",
};

const num = (v: string | undefined) => {
  const n = parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};

export default async function CreditNoteDocumentPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  await requireCompanyOrg();
  const orgCtx = await getOrgContext(session.userId, session.activeOrgId);
  if (!orgCtx) redirect("/");

  const sheets = await getSheetsService(orgCtx.orgId);
  await ensureTabsCached(sheets, orgCtx.orgId);
  const [note, org] = await Promise.all([
    sheets.getById(SHEET_TABS.CREDIT_NOTES, "NoteID", params.id),
    prisma.organization.findUnique({
      where: { id: orgCtx.orgId },
      select: {
        name: true,
        taxId: true,
        address: true,
        phone: true,
        branchType: true,
        branchNumber: true,
        logoUrl: true,
        signatureUrl: true,
        signatoryName: true,
      },
    }),
  ]);
  if (!note) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>ไม่พบเอกสาร</h1>
        <a href="/credit-notes">← กลับ</a>
      </div>
    );
  }
  if (!isDocInScope(orgCtx, session.userId, note.EventID, note.PreparedByUserId)) notFound();
  if (!org) redirect("/");

  const kind = note.Kind === "debit" ? "debit" : "credit";
  return (
    <CreditNoteDocument
      driveSave={{
        kind: "credit-note",
        id: params.id,
        version: note.UpdatedAt || "",
        savedFor: note.PdfFor || "",
        savedUrl: note.PdfUrl || "",
        savedContentFor: note.PdfContentFor || "",
        enabled: true,
      }}
      org={{
        name: org.name,
        taxId: org.taxId,
        address: note.IssuerAddressSnapshot || org.address || "",
        phone: org.phone || "",
        branchInfo:
          note.IssuerBranchSnapshot ||
          (org.branchType === "Branch" && org.branchNumber
            ? `สาขา ${org.branchNumber.padStart(5, "0")}`
            : "สำนักงานใหญ่ (00000)"),
        logoUrl: org.logoUrl,
        signatureUrl: org.signatureUrl,
        signatoryName: org.signatoryName,
      }}
      note={{
        kind,
        docNumber: note.DocNumber || "",
        docDate: note.DocDate || "",
        status: note.Status === "void" ? "void" : "issued",
        sourceDocNumber: note.SourceDocNumber || "",
        sourceDocDate: note.SourceDocDate || "",
        originalSubtotal: num(note.OriginalSubtotal),
        priorAdjustment: num(note.PriorAdjustment),
        correctSubtotal: num(note.CorrectSubtotal),
        diffAmount: num(note.DiffAmount),
        vatAmount: num(note.VATAmount),
        grandTotal: num(note.GrandTotal),
        reasonLabel: noteReasonLabel(kind, note.ReasonCode || ""),
        reason: note.Reason || "",
        description: note.Description || "",
        customerName: note.CustomerNameSnapshot || "",
        customerTaxId: note.CustomerTaxIdSnapshot || "",
        customerBranch: note.CustomerBranchSnapshot || "",
        customerAddress: note.CustomerAddressSnapshot || "",
        preparedBy: note.PreparedBy || "",
      }}
    />
  );
}
